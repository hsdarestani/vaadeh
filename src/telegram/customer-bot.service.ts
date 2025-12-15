import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import TelegramBot from 'node-telegram-bot-api';
import { Prisma, DeliveryType } from '@prisma/client';
import { OrdersService } from '../orders/orders.service';
import { AddressesService } from '../addresses/addresses.service';
import { PrismaService } from '../prisma/prisma.service';
import { VendorMatchingService } from '../orders/vendor-matching.service';
import { PaymentsService } from '../payments/payments.service';
import { AuthService } from '../auth/auth.service';

const MAIN_MENU = {
  NEW_ORDER: 'new_order',
  MY_ORDERS: 'my_orders',
  ADDRESSES: 'addresses',
  SUPPORT: 'support',
  LINK: 'link'
};

interface CartState {
  [variantId: string]: number;
}

interface CustomerSession {
  stage:
    | 'idle'
    | 'awaiting_mobile'
    | 'awaiting_otp'
    | 'select_address'
    | 'select_vendor'
    | 'browse_menu'
    | 'delivery_choice'
    | 'payment_choice';
  mobile?: string;
  addressId?: string;
  addressSnapshot?: { lat: number; lng: number; fullAddress: string; title: string };
  vendorId?: string;
  vendorName?: string;
  deliveryType?: DeliveryType;
  payAtDelivery?: boolean;
  cart: CartState;
  menuPage?: number;
}

@Injectable()
export class CustomerBotService implements OnModuleInit {
  private bot?: TelegramBot;
  private readonly logger = new Logger(CustomerBotService.name);
  private readonly sessions = new Map<number, CustomerSession>();

  constructor(
    private readonly orders: OrdersService,
    private readonly addresses: AddressesService,
    private readonly prisma: PrismaService,
    private readonly matching: VendorMatchingService,
    private readonly payments: PaymentsService,
    private readonly auth: AuthService
  ) {}

  onModuleInit(): void {
    const token = process.env.TELEGRAM_CUSTOMER_BOT_TOKEN;
    if (!token) {
      this.logger.warn('TELEGRAM_CUSTOMER_BOT_TOKEN not set; customer bot disabled');
      return;
    }
    this.bot = new TelegramBot(token, { polling: true });
    this.registerHandlers();
    this.logger.log('Customer bot initialized');
  }

  private getSession(chatId: number): CustomerSession {
    if (!this.sessions.has(chatId)) {
      this.sessions.set(chatId, { stage: 'idle', cart: {} });
    }
    return this.sessions.get(chatId)!;
  }

  private async ensureLinked(chatId: number): Promise<string | null> {
    const user = await this.orders.getTelegramUser(chatId);
    if (user) return user.id;

    await this.bot?.sendMessage(
      chatId,
      'برای ادامه، شماره موبایل ثبت‌شده خود را ارسال کنید تا کد تأیید دریافت کنید.',
      { reply_markup: { force_reply: true } }
    );
    const session = this.getSession(chatId);
    session.stage = 'awaiting_mobile';
    return null;
  }

  private renderMainMenu(chatId: number) {
    return this.bot?.sendMessage(chatId, 'به وعده خوش آمدید. یکی از گزینه‌ها را انتخاب کنید.', {
      reply_markup: {
        inline_keyboard: [
          [
            { text: 'ثبت سفارش جدید 🍽️', callback_data: `action:${MAIN_MENU.NEW_ORDER}` },
            { text: 'سفارش‌های من 📦', callback_data: `action:${MAIN_MENU.MY_ORDERS}` }
          ],
          [
            { text: 'آدرس‌های من 📍', callback_data: `action:${MAIN_MENU.ADDRESSES}` },
            { text: 'پشتیبانی 💬', callback_data: `action:${MAIN_MENU.SUPPORT}` }
          ],
          [{ text: 'اتصال اکانت 🔐', callback_data: `action:${MAIN_MENU.LINK}` }]
        ]
      }
    });
  }

  private async promptAddressSelection(chatId: number, userId: string) {
    const addresses = await this.addresses.listByTelegramUser(chatId);
    const session = this.getSession(chatId);
    session.stage = 'select_address';
    if (!addresses.length) {
      await this.bot?.sendMessage(
        chatId,
        'آدرسی ندارید. ابتدا موقعیت خود را ارسال کنید (لوکیشن) تا آدرس اضافه شود.'
      );
      return;
    }

    const keyboard = addresses.map((a) => [{ text: `${a.title}${a.isDefault ? ' ✅' : ''}`, callback_data: `address:${a.id}` }]);
    keyboard.push([{ text: '➕ افزودن آدرس جدید', callback_data: 'address:add' }]);
    await this.bot?.sendMessage(chatId, 'آدرس ارسال را انتخاب کنید:', {
      reply_markup: { inline_keyboard: keyboard }
    });
  }

  private async sendVendorChoices(chatId: number) {
    const session = this.getSession(chatId);
    if (!session.addressSnapshot) return;
    const vendors = await this.prisma.vendor.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, take: 10 });
    session.stage = 'select_vendor';
    const keyboard = vendors.map((v) => [{ text: v.name, callback_data: `vendor:${v.id}` }]);
    await this.bot?.sendMessage(chatId, 'رستوران/وندر مورد نظر را انتخاب کنید:', {
      reply_markup: { inline_keyboard: keyboard }
    });
  }

  private buildMenuKeyboard(variants: { id: string; label: string }[], page: number, hasNext: boolean) {
    const buttons = variants.map((v) => [{ text: v.label, callback_data: `add:${v.id}` }]);
    const footer: TelegramBot.InlineKeyboardButton[] = [];
    if (page > 0) footer.push({ text: '⬅️ قبلی', callback_data: `menu:prev:${page - 1}` });
    if (hasNext) footer.push({ text: '➡️ بعدی', callback_data: `menu:next:${page + 1}` });
    if (footer.length) buttons.push(footer);
    buttons.push([{ text: '🛒 مشاهده سبد', callback_data: 'cart:view' }]);
    buttons.push([{ text: 'ادامه ➡️', callback_data: 'cart:checkout' }]);
    return { inline_keyboard: buttons } as TelegramBot.InlineKeyboardMarkup;
  }

  private async sendMenu(chatId: number) {
    const session = this.getSession(chatId);
    if (!session.vendorId) return;
    const page = session.menuPage ?? 0;
    const take = 6;
    const items = await this.prisma.menuItem.findMany({
      where: { vendorId: session.vendorId, isActive: true },
      include: { variants: true },
      orderBy: { createdAt: 'desc' },
      skip: page * take,
      take: take + 1
    });

    if (!items.length) {
      await this.bot?.sendMessage(chatId, 'منویی برای این وندور یافت نشد.');
      return;
    }
    const hasNext = items.length > take;
    const slice = items.slice(0, take);
    const variants = slice.flatMap((item) =>
      item.variants.map((variant) => ({
        id: variant.id,
        label: `${item.name} - ${variant.code} (${Number(variant.price)} تومان)`
      }))
    );
    await this.bot?.sendMessage(chatId, 'از منو انتخاب کنید:', {
      reply_markup: this.buildMenuKeyboard(variants, page, hasNext)
    });
    session.stage = 'browse_menu';
  }

  private renderCart(cart: CartState, variantLookup: Record<string, { name: string; price: Prisma.Decimal; code: string }>) {
    const lines = Object.entries(cart).map(([id, qty]) => {
      const ref = variantLookup[id];
      if (!ref) return '';
      return `${ref.name} (${ref.code}) x${qty}`;
    });
    return lines.filter(Boolean).join('\n') || 'سبد شما خالی است.';
  }

  private async showCart(chatId: number) {
    const session = this.getSession(chatId);
    const variantIds = Object.keys(session.cart);
    const variants = await this.prisma.menuVariant.findMany({
      where: { id: { in: variantIds } },
      include: { menuItem: true }
    });
    const lookup: Record<string, { name: string; price: Prisma.Decimal; code: string }> = {};
    variants.forEach((v) => (lookup[v.id] = { name: v.menuItem.name, price: v.price, code: v.code }));
    const cartText = this.renderCart(session.cart, lookup);
    await this.bot?.sendMessage(chatId, cartText, {
      reply_markup: {
        inline_keyboard: [
          ...variants.map((v) => [
            { text: `➕ ${v.menuItem.name}`, callback_data: `add:${v.id}` },
            { text: '➖', callback_data: `remove:${v.id}` }
          ]),
          [{ text: 'ادامه ➡️', callback_data: 'cart:checkout' }]
        ]
      }
    });
  }

  private async chooseDelivery(chatId: number) {
    const session = this.getSession(chatId);
    if (!session.addressSnapshot || !session.vendorId) return;
    const vendor = await this.prisma.vendor.findUnique({ where: { id: session.vendorId } });
    if (!vendor) return;
    let match;
    try {
      match = await this.matching.matchVendor({ vendor, location: { lat: session.addressSnapshot.lat, lng: session.addressSnapshot.lng } });
    } catch (err) {
      await this.bot?.sendMessage(chatId, err instanceof Error ? err.message : 'خطا در محاسبه ارسال');
      return;
    }
    session.deliveryType = match.deliveryType;
    session.stage = 'delivery_choice';
    const options: TelegramBot.InlineKeyboardButton[] = [];
    options.push({
      text: match.deliveryType === DeliveryType.IN_ZONE_INTERNAL ? 'ارسال داخل محدوده 🚚' : 'خارج محدوده با اسنپ 🚕',
      callback_data: `delivery:${match.deliveryType}`
    });
    await this.bot?.sendMessage(chatId, 'نوع ارسال را انتخاب کنید:', {
      reply_markup: { inline_keyboard: [options] }
    });
  }

  private async choosePayment(chatId: number) {
    const session = this.getSession(chatId);
    if (!session.deliveryType) return;
    session.stage = 'payment_choice';
    const buttons: TelegramBot.InlineKeyboardButton[] = [];
    if (session.deliveryType === DeliveryType.IN_ZONE_INTERNAL) {
      buttons.push({ text: 'پرداخت آنلاین (زیبال)', callback_data: 'pay:online' });
    }
    buttons.push({ text: 'پرداخت در محل/پس‌کرایه', callback_data: 'pay:cod' });
    await this.bot?.sendMessage(chatId, 'روش پرداخت:', {
      reply_markup: { inline_keyboard: [buttons] }
    });
  }

  private async finalizeOrder(chatId: number, userId: string) {
    const session = this.getSession(chatId);
    if (!session.addressId || !Object.keys(session.cart).length || !session.deliveryType) {
      await this.bot?.sendMessage(chatId, 'برای ثبت سفارش اطلاعات کافی نیست.');
      return;
    }

    const items = Object.entries(session.cart).map(([menuVariantId, qty]) => ({ menuVariantId, qty }));
    let order;
    try {
      order = await this.orders.create(userId, {
        addressId: session.addressId,
        items,
        deliveryType: session.deliveryType,
        payAtDelivery: session.payAtDelivery,
        location: session.addressSnapshot ? { lat: session.addressSnapshot.lat, lng: session.addressSnapshot.lng } : undefined
      });
    } catch (err) {
      await this.bot?.sendMessage(chatId, err instanceof Error ? err.message : 'خطا در ثبت سفارش');
      return;
    }

    const lines = await this.prisma.orderItem.findMany({ where: { orderId: order.id }, include: { menuVariant: { include: { menuItem: true } } } });
    const orderLines = lines
      .map((l) => `${l.menuVariant.menuItem.name} (${l.menuVariant.code}) x${l.qty}`)
      .join('\n');

    await this.bot?.sendMessage(
      chatId,
      `سفارش شما ثبت شد. کد سفارش: ${order.id.slice(-6)}\n${orderLines}\nوضعیت پرداخت: ${order.paymentStatus}`
    );

    if (!session.payAtDelivery && order.paymentStatus !== 'NONE') {
      const { payLink } = await this.payments.requestZibal(order.id, userId);
      if (payLink) {
        await this.bot?.sendMessage(chatId, `برای پرداخت آنلاین روی لینک زیر بزنید:\n${payLink}`);
      }
    }

    session.cart = {};
    session.stage = 'idle';
  }

  private async handleCallback(query: TelegramBot.CallbackQuery) {
    if (!query.data || !query.message) return;
    const chatId = query.message.chat.id;
    const session = this.getSession(chatId);
    const [action, payload, extra] = query.data.split(':');

    if (action === 'action') {
      switch (payload) {
        case MAIN_MENU.NEW_ORDER: {
          const userId = await this.ensureLinked(chatId);
          if (!userId) return;
          await this.promptAddressSelection(chatId, userId);
          break;
        }
        case MAIN_MENU.MY_ORDERS: {
          const user = await this.orders.getTelegramUser(chatId);
          if (!user) {
            await this.ensureLinked(chatId);
            return;
          }
          const orders = await this.prisma.order.findMany({
            where: { userId: user.id },
            orderBy: { createdAt: 'desc' },
            include: { vendor: true },
            take: 10
          });
          if (!orders.length) {
            await this.bot?.sendMessage(chatId, 'سفارشی یافت نشد.');
            return;
          }
          const buttons = orders.map((o) => [
            {
              text: `${o.vendor.name} | ${o.status} | ${o.createdAt.toLocaleDateString('fa-IR')}`,
              callback_data: `order:${o.id}`
            }
          ]);
          await this.bot?.sendMessage(chatId, 'سفارش‌های اخیر شما:', { reply_markup: { inline_keyboard: buttons } });
          break;
        }
        case MAIN_MENU.ADDRESSES: {
          const userId = await this.ensureLinked(chatId);
          if (!userId) return;
          const addresses = await this.addresses.listByTelegramUser(chatId);
          if (!addresses.length) {
            await this.bot?.sendMessage(chatId, 'آدرسی ثبت نشده است. از گزینه افزودن آدرس استفاده کنید.');
            return;
          }
          const rendered = addresses
            .map((a) => `${a.title}${a.isDefault ? ' (پیش‌فرض)' : ''}: ${a.fullAddress}`)
            .join('\n');
          await this.bot?.sendMessage(chatId, rendered);
          break;
        }
        case MAIN_MENU.SUPPORT:
          await this.bot?.sendMessage(chatId, 'برای پشتیبانی با 021-000000 تماس بگیرید یا در همین چت پیام دهید.');
          break;
        case MAIN_MENU.LINK:
          await this.ensureLinked(chatId);
          break;
        default:
          await this.renderMainMenu(chatId);
      }
      await this.bot?.answerCallbackQuery(query.id);
      return;
    }

    if (action === 'address') {
      if (payload === 'add') {
        session.stage = 'select_address';
        await this.bot?.sendMessage(chatId, 'لوکیشن آدرس جدید را ارسال کنید.');
        await this.bot?.answerCallbackQuery(query.id);
        return;
      }
      const address = await this.prisma.address.findUnique({ where: { id: payload } });
      if (!address) return;
      session.addressId = address.id;
      session.addressSnapshot = {
        lat: address.lat,
        lng: address.lng,
        fullAddress: address.fullAddress,
        title: address.title
      };
      await this.bot?.answerCallbackQuery(query.id, { text: 'آدرس انتخاب شد' });
      await this.sendVendorChoices(chatId);
      return;
    }

    if (action === 'vendor') {
      session.vendorId = payload;
      const vendor = await this.prisma.vendor.findUnique({ where: { id: payload } });
      session.vendorName = vendor?.name;
      session.menuPage = 0;
      session.cart = {};
      await this.bot?.answerCallbackQuery(query.id, { text: vendor?.name ?? 'انتخاب شد' });
      await this.sendMenu(chatId);
      return;
    }

    if (action === 'menu') {
      session.menuPage = Number(payload === 'next' ? extra : payload === 'prev' ? extra : session.menuPage ?? 0);
      await this.bot?.answerCallbackQuery(query.id);
      await this.sendMenu(chatId);
      return;
    }

    if (action === 'add') {
      session.cart[payload] = (session.cart[payload] ?? 0) + 1;
      await this.bot?.answerCallbackQuery(query.id, { text: 'به سبد افزوده شد' });
      return;
    }

    if (action === 'remove') {
      if (session.cart[payload]) {
        session.cart[payload] -= 1;
        if (session.cart[payload] <= 0) delete session.cart[payload];
      }
      await this.bot?.answerCallbackQuery(query.id, { text: 'بروزرسانی شد' });
      return;
    }

    if (action === 'cart') {
      if (payload === 'view') {
        await this.bot?.answerCallbackQuery(query.id);
        await this.showCart(chatId);
        return;
      }
      if (payload === 'checkout') {
        if (!Object.keys(session.cart).length) {
          await this.bot?.answerCallbackQuery(query.id, { text: 'سبد خالی است' });
          return;
        }
        await this.bot?.answerCallbackQuery(query.id);
        await this.chooseDelivery(chatId);
        return;
      }
    }

    if (action === 'delivery') {
      session.deliveryType = payload as DeliveryType;
      await this.bot?.answerCallbackQuery(query.id, { text: 'ارسال انتخاب شد' });
      await this.choosePayment(chatId);
      return;
    }

    if (action === 'pay') {
      session.payAtDelivery = payload === 'cod';
      await this.bot?.answerCallbackQuery(query.id, { text: 'پرداخت انتخاب شد' });
      const user = await this.orders.getTelegramUser(chatId);
      if (!user) return;
      await this.finalizeOrder(chatId, user.id);
      return;
    }

    if (action === 'order') {
      const order = await this.prisma.order.findUnique({
        where: { id: payload },
        include: { items: { include: { menuVariant: { include: { menuItem: true } } } }, vendor: true, history: true }
      });
      if (!order) return;
      const lines = order.items
        .map((i) => `${i.menuVariant.menuItem.name} (${i.menuVariant.code}) x${i.qty}`)
        .join('\n');
      const timeline = order.history.map((h) => `${h.status} - ${h.changedAt.toLocaleString('fa-IR')}`).join('\n');
      await this.bot?.answerCallbackQuery(query.id);
      await this.bot?.sendMessage(
        chatId,
        `سفارش #${order.id.slice(-6)}\n${order.vendor.name}\n${lines}\nپرداخت: ${order.paymentStatus}\nوضعیت: ${order.status}\nتایم‌لاین:\n${timeline}`
      );
      return;
    }
  }

  private async handleText(chatId: number, text: string) {
    const session = this.getSession(chatId);
    if (session.stage === 'awaiting_mobile') {
      const mobile = text.trim();
      session.mobile = mobile;
      await this.auth.requestOtp(mobile);
      session.stage = 'awaiting_otp';
      await this.bot?.sendMessage(chatId, 'کد ارسال‌شده را وارد کنید.');
      return;
    }

    if (session.stage === 'awaiting_otp' && session.mobile) {
      const verified = await this.auth.verifyOtp(session.mobile, text.trim());
      const user = verified.user;
      await this.prisma.user.update({ where: { id: user.id }, data: { telegramUserId: chatId.toString() } });
      session.stage = 'idle';
      await this.bot?.sendMessage(chatId, 'اکانت تلگرام شما متصل شد.');
      await this.renderMainMenu(chatId);
      return;
    }

    if (session.stage === 'select_address' && text === '') return;
  }

  private async handleLocation(chatId: number, location: TelegramBot.Location) {
    const session = this.getSession(chatId);
    if (session.stage === 'select_address') {
      session.addressSnapshot = {
        lat: location.latitude,
        lng: location.longitude,
        fullAddress: 'آدرس ثبت‌شده از طریق تلگرام',
        title: 'آدرس تلگرام'
      };
      const user = await this.orders.getTelegramUser(chatId);
      if (!user) return;
      const address = await this.prisma.address.create({
        data: {
          userId: user.id,
          title: 'تلگرام',
          lat: location.latitude,
          lng: location.longitude,
          fullAddress: 'آدرس ثبت‌شده از طریق تلگرام',
          isDefault: false
        }
      });
      session.addressId = address.id;
      await this.bot?.sendMessage(chatId, 'آدرس جدید ثبت شد.');
      await this.sendVendorChoices(chatId);
    }
  }

  private registerHandlers() {
    if (!this.bot) return;

    this.bot.onText(/\/start/, async (msg) => {
      await this.ensureLinked(msg.chat.id);
      await this.renderMainMenu(msg.chat.id);
    });

    this.bot.on('callback_query', async (query) => {
      try {
        await this.handleCallback(query);
      } catch (err) {
        this.logger.error(err);
        await this.bot?.answerCallbackQuery(query.id, { text: 'خطا رخ داد' });
      }
    });

    this.bot.on('message', async (msg) => {
      if (msg.location) {
        await this.handleLocation(msg.chat.id, msg.location);
        return;
      }

      if (msg.text && !msg.text.startsWith('/')) {
        await this.handleText(msg.chat.id, msg.text);
      }
    });
  }
}
