import crypto from 'node:crypto';
import { db } from './db.ts';
import { hashPassword } from './auth.ts';

export function seedDatabase(): void {
  const existingUsers = db.prepare('SELECT COUNT(*) as cnt FROM users').get() as { cnt: number };
  if (existingUsers.cnt > 0) {
    return;
  }

  console.log('Seeding DineEasy relational database...');

  // 1. Restaurant Settings
  const settings: Array<[string, string]> = [
    ['restaurant_name', 'DineEasy Bistro'],
    ['restaurant_tagline', 'Good Food, Better Mood'],
    ['restaurant_address', 'No. 48, Street 240, Sangkat Chaktomuk, Phnom Penh'],
    ['restaurant_phone', '+855 23 888 999'],
    ['restaurant_email', 'hello@dineeasy.kh'],
    ['business_hours', '08:00 - 22:30 (Daily)'],
    ['timezone', 'Asia/Phnom_Penh'],
    ['default_language', 'en'],
    ['currency', 'USD'],
    ['exchange_rate_khr', '4050'],
    ['tax_rate', '0'],
    ['service_charge_rate', '0'],
    ['enable_cash_payment', 'true'],
    ['enable_expenses_module', 'true'],
    ['khqr_bank_name', 'ABA Bank'],
    ['khqr_account_name', 'DINEEASY BISTRO CO., LTD'],
    ['khqr_account_id', '001 234 567'],
    ['khqr_payload', '00020101021129450016abaakhppxxx@abaa01120012345670208ABA Bank5204581253038405802KH5915DINEEASY BISTRO6010Phnom Penh6304A1B2'],
    ['receipt_footer_en', 'Thank you for dining with DineEasy Bistro! Please come again.'],
    ['receipt_footer_km', 'សូមអរគុណសម្រាប់ការអញ្ជើញមកពិសាអាហារនៅ DineEasy Bistro!'],
    ['sound_notifications', 'true'],
    ['hero_image_url', '/menu-images/hero_restaurant_dining_1794534817922.jpg'],
  ];
  const insertSetting = db.prepare('INSERT OR IGNORE INTO restaurant_settings (setting_key, setting_value) VALUES (?, ?)');
  for (const [k, v] of settings) insertSetting.run(k, v);

  // 2. Demo Users (hashed with bcryptjs)
  const insertUser = db.prepare(
    'INSERT INTO users (name, username, email, password_hash, role, is_active) VALUES (?, ?, ?, ?, ?, 1)'
  );
  insertUser.run('Owner Admin', 'admin', 'admin@dineeasy.kh', hashPassword('admin123'), 'admin');
  const staffRes = insertUser.run('Sokha', 'sokha', 'sokha@dineeasy.kh', hashPassword('staff123'), 'staff');
  const staffId = Number(staffRes.lastInsertRowid);
  insertUser.run('Chef Vannak', 'chef', 'chef@dineeasy.kh', hashPassword('chef123'), 'chef');

  // 3. Languages
  const insertLang = db.prepare(
    'INSERT INTO languages (code, name, native_name, direction, is_active, is_default) VALUES (?, ?, ?, ?, ?, ?)'
  );
  insertLang.run('en', 'English', 'English', 'ltr', 1, 1);
  insertLang.run('km', 'Khmer', 'ភាសាខ្មែរ', 'ltr', 1, 0);
  insertLang.run('zh', 'Chinese (Simplified)', '简体中文', 'ltr', 1, 0);
  insertLang.run('vi', 'Vietnamese', 'Tiếng Việt', 'ltr', 1, 0);
  insertLang.run('ja', 'Japanese', '日本語', 'ltr', 1, 0);
  insertLang.run('ko', 'Korean', '한국어', 'ltr', 1, 0);
  insertLang.run('fr', 'French', 'Français', 'ltr', 1, 0);

  // 4. UI Translations (Comprehensive EN + KM + starter ZH/VI/JA/KO/FR)
  const translations: Record<string, Record<string, string>> = {
    en: {
      'app.name': 'DineEasy',
      'nav.home': 'Home',
      'nav.menu': 'Menu',
      'nav.cart': 'Cart',
      'nav.orders': 'Orders',
      'nav.tables': 'Tables',
      'nav.checkout': 'Checkout',
      'nav.kitchen': 'Kitchen (KDS)',
      'nav.dashboard': 'Dashboard',
      'nav.categories': 'Categories',
      'nav.staff': 'Staff & Users',
      'nav.payments': 'Payments',
      'nav.reports': 'Reports',
      'nav.expenses': 'Expenses',
      'nav.languages': 'Languages',
      'nav.settings': 'Settings',
      'nav.logout': 'Log out',
      'customer.welcome_title': 'Good Food, Better Mood',
      'customer.welcome_subtitle': 'Freshly prepared Khmer & international favorites delivered straight to your table.',
      'customer.browse_menu': 'Browse Menu',
      'customer.table': 'Table',
      'customer.search_placeholder': 'Search dishes, drinks, soups...',
      'customer.all_categories': 'All',
      'customer.popular': 'Popular',
      'customer.recommended': 'Chef Recommended',
      'customer.new_items': 'New Arrival',
      'customer.special_offer': 'Special Offer',
      'customer.unavailable': 'Unavailable',
      'customer.add_to_cart': 'Add to Cart',
      'customer.added_to_cart': 'Added to cart',
      'customer.your_cart': 'Your Cart',
      'customer.cart_empty': 'Your cart is empty',
      'customer.cart_empty_hint': 'Select dishes from the menu to start your order.',
      'customer.continue_browsing': 'Continue Browsing',
      'customer.clear_cart': 'Clear Cart',
      'customer.order_notes': 'Order Notes (e.g. allergies, serve together)',
      'customer.special_instructions': 'Special Instructions',
      'customer.quantity': 'Quantity',
      'customer.total': 'Total',
      'customer.subtotal': 'Subtotal',
      'customer.place_order': 'Order Now',
      'customer.placing_order': 'Submitting Order...',
      'customer.order_success': 'Order placed successfully!',
      'customer.order_tracking': 'Order Tracking',
      'customer.no_orders_yet': 'No orders in this table session yet.',
      'customer.request_checkout': 'Request Checkout',
      'customer.checkout_requested': 'Checkout requested — staff is coming to your table.',
      'customer.download_receipt': 'Download PDF Receipt',
      'status.placed': 'Order Placed',
      'status.confirmed': 'Confirmed',
      'status.cooking': 'Preparing',
      'status.ready': 'Ready',
      'status.served': 'Delivered',
      'status.completed': 'Completed',
      'status.cancelled': 'Cancelled',
      'staff.new_orders': 'New Orders',
      'staff.confirm_order': 'Confirm Order',
      'staff.mark_served': 'Mark Served',
      'staff.order_summary': 'Order Summary',
      'staff.payment_method': 'Payment Method',
      'staff.scan_to_pay': 'Scan to Pay',
      'staff.waiting_payment': 'Waiting for payment verification',
      'staff.mark_paid': 'Mark as Paid',
      'staff.print_receipt': 'Print Receipt',
      'staff.download_pdf': 'Download PDF Receipt',
      'staff.close_session': 'Close Table Session',
      'chef.all_orders': 'All Orders',
      'chef.start_cooking': 'Start Cooking',
      'chef.mark_ready': 'Mark Ready',
      'chef.sound_on': 'Sound On',
      'chef.sound_off': 'Sound Muted',
      'admin.total_sales': 'Total Sales',
      'admin.total_orders': 'Total Orders',
      'admin.avg_order_value': 'Avg. Order Value',
      'admin.active_tables': 'Active Tables',
      'common.save': 'Save',
      'common.cancel': 'Cancel',
      'common.delete': 'Delete',
      'common.edit': 'Edit',
      'common.add': 'Add New',
      'common.loading': 'Loading...',
      'common.error': 'Something went wrong',
    },
    km: {
      'app.name': 'DineEasy',
      'nav.home': 'ទំព័រដើម',
      'nav.menu': 'មីនុយ',
      'nav.cart': 'កន្ត្រក',
      'nav.orders': 'ការកម្ម៉ង់',
      'nav.tables': 'តុអាហារ',
      'nav.checkout': 'គិតលុយ',
      'nav.kitchen': 'ផ្ទះបាយ (KDS)',
      'nav.dashboard': 'ផ្ទាំងគ្រប់គ្រង',
      'nav.categories': 'ប្រភេទម្ហូប',
      'nav.staff': 'បុគ្គលិក និងអ្នកប្រើ',
      'nav.payments': 'ការទូទាត់',
      'nav.reports': 'របាយការណ៍',
      'nav.expenses': 'ចំណាយ',
      'nav.languages': 'ភាសា',
      'nav.settings': 'ការកំណត់',
      'nav.logout': 'ចាកចេញ',
      'customer.welcome_title': 'ម្ហូបឆ្ងាញ់ អារម្មណ៍ល្អ',
      'customer.welcome_subtitle': 'ម្ហូបខ្មែរ និងអន្តរជាតិចម្អិនថ្មីៗ រួចរាល់បម្រើដល់តុរបស់អ្នក។',
      'customer.browse_menu': 'មើលមីនុយ',
      'customer.table': 'តុលេខ',
      'customer.search_placeholder': 'ស្វែងរកម្ហូប ភេសជ្ជៈ ស៊ុប...',
      'customer.all_categories': 'ទាំងអស់',
      'customer.popular': 'ពេញនិយម',
      'customer.recommended': 'ណែនាំដោយចុងភៅ',
      'customer.new_items': 'មុខម្ហូបថ្មី',
      'customer.special_offer': 'ប្រូម៉ូសិនពិសេស',
      'customer.unavailable': 'អស់ស្តុក',
      'customer.add_to_cart': 'ដាក់ចូលកន្ត្រក',
      'customer.added_to_cart': 'បានដាក់ចូលកន្ត្រក',
      'customer.your_cart': 'កន្ត្រករបស់អ្នក',
      'customer.cart_empty': 'កន្ត្រករបស់អ្នកទទេ',
      'customer.cart_empty_hint': 'សូមជ្រើសរើសមុខម្ហូបពីមីនុយដើម្បីចាប់ផ្តើមកម្ម៉ង់។',
      'customer.continue_browsing': 'បន្តមើលមីនុយ',
      'customer.clear_cart': 'សម្អាតកន្ត្រក',
      'customer.order_notes': 'កំណត់ចំណាំការកម្ម៉ង់',
      'customer.special_instructions': 'សំណូមពរពិសេស',
      'customer.quantity': 'ចំនួន',
      'customer.total': 'សរុប',
      'customer.subtotal': 'សរុបរង',
      'customer.place_order': 'បញ្ជាទិញឥឡូវ',
      'customer.placing_order': 'កំពុងបញ្ជូនការកម្ម៉ង់...',
      'customer.order_success': 'ការកម្ម៉ង់បានជោគជ័យ!',
      'customer.order_tracking': 'តាមដានការកម្ម៉ង់',
      'customer.no_orders_yet': 'មិនទាន់មានការកម្ម៉ង់សម្រាប់តុនេះនៅឡើយទេ។',
      'customer.request_checkout': 'ស្នើសុំគិតលុយ',
      'customer.checkout_requested': 'បានស្នើសុំគិតលុយ — បុគ្គលិកកំពុងមកតុរបស់អ្នក។',
      'customer.download_receipt': 'ទាញយកវិក្កយបត្រ PDF',
      'status.placed': 'បានកម្ម៉ង់',
      'status.confirmed': 'បានយល់ព្រម',
      'status.cooking': 'កំពុងចម្អិន',
      'status.ready': 'រួចរាល់',
      'status.served': 'បានបម្រើ',
      'status.completed': 'បានបញ្ចប់',
      'status.cancelled': 'បានបោះបង់',
      'staff.new_orders': 'ការកម្ម៉ង់ថ្មី',
      'staff.confirm_order': 'យល់ព្រមការកម្ម៉ង់',
      'staff.mark_served': 'បានយកទៅជូន',
      'staff.order_summary': 'សង្ខេបវិក្កយបត្រ',
      'staff.payment_method': 'វិធីសាស្ត្រទូទាត់',
      'staff.scan_to_pay': 'ស្កេនដើម្បីទូទាត់',
      'staff.waiting_payment': 'កំពុងរង់ចាំការផ្ទៀងផ្ទាត់ប្រាក់',
      'staff.mark_paid': 'បញ្ជាក់ថាបានទូទាត់',
      'staff.print_receipt': 'បោះពុម្ពវិក្កយបត្រ',
      'staff.download_pdf': 'ទាញយកវិក្កយបត្រ PDF',
      'staff.close_session': 'បិទ Table Session',
      'chef.all_orders': 'ការកម្ម៉ង់ទាំងអស់',
      'chef.start_cooking': 'ចាប់ផ្តើមចម្អិន',
      'chef.mark_ready': 'រួចរាល់',
      'chef.sound_on': 'បើកសំឡេង',
      'chef.sound_off': 'បិទសំឡេង',
      'admin.total_sales': 'ចំណូលសរុប',
      'admin.total_orders': 'ការកម្ម៉ង់សរុប',
      'admin.avg_order_value': 'តម្លៃមធ្យមក្នុងមួយកម្ម៉ង់',
      'admin.active_tables': 'តុដែលកំពុងប្រើ',
      'common.save': 'រក្សាទុក',
      'common.cancel': 'បោះបង់',
      'common.delete': 'លុប',
      'common.edit': 'កែប្រែ',
      'common.add': 'បន្ថែមថ្មី',
      'common.loading': 'កំពុងផ្ទុក...',
      'common.error': 'មានបញ្ហាកើតឡើង',
    },
    zh: {
      'nav.home': '首页',
      'nav.menu': '菜单',
      'nav.cart': '购物车',
      'nav.orders': '订单',
      'customer.welcome_title': '美味佳肴，愉悦心情',
      'customer.table': '桌号',
      'customer.search_placeholder': '搜索菜品、饮品、汤类...',
      'customer.all_categories': '全部',
      'customer.add_to_cart': '加入购物车',
      'customer.your_cart': '您的购物车',
      'customer.place_order': '立即下单',
      'customer.order_tracking': '订单状态',
      'customer.request_checkout': '呼叫结账',
      'status.placed': '已下单',
      'status.confirmed': '已确认',
      'status.cooking': '烹饪中',
      'status.ready': '待上菜',
      'status.served': '已上菜',
      'status.completed': '已完成',
    },
    vi: {
      'nav.home': 'Trang chủ',
      'nav.menu': 'Thực đơn',
      'nav.cart': 'Giỏ hàng',
      'nav.orders': 'Đơn hàng',
      'customer.welcome_title': 'Món Ngon, Tâm Trạng Tốt',
      'customer.table': 'Bàn',
      'customer.search_placeholder': 'Tìm món ăn, đồ uống...',
      'customer.all_categories': 'Tất cả',
      'customer.add_to_cart': 'Thêm vào giỏ',
      'customer.place_order': 'Đặt món ngay',
      'customer.order_tracking': 'Theo dõi đơn',
    },
    ja: {
      'nav.home': 'ホーム',
      'nav.menu': 'メニュー',
      'nav.cart': 'カート',
      'nav.orders': '注文状況',
      'customer.welcome_title': '美味しい料理で笑顔に',
      'customer.table': 'テーブル',
      'customer.all_categories': 'すべて',
      'customer.add_to_cart': 'カートに追加',
      'customer.place_order': '注文を確定する',
    },
    ko: {
      'nav.home': '홈',
      'nav.menu': '메뉴',
      'nav.cart': '장바구니',
      'nav.orders': '주문 내역',
      'customer.welcome_title': '맛있는 음식, 기분 좋은 시간',
      'customer.table': '테이블',
      'customer.all_categories': '전체',
      'customer.add_to_cart': '장바구니 담기',
      'customer.place_order': '주문하기',
    },
    fr: {
      'nav.home': 'Accueil',
      'nav.menu': 'Menu',
      'nav.cart': 'Panier',
      'nav.orders': 'Commandes',
      'customer.welcome_title': 'Bonne Cuisine, Bonne Humeur',
      'customer.table': 'Table',
      'customer.all_categories': 'Tout',
      'customer.add_to_cart': 'Ajouter',
      'customer.place_order': 'Commander',
    },
  };

  const insertTrans = db.prepare(
    'INSERT OR IGNORE INTO ui_translations (language_code, translation_key, translation_value) VALUES (?, ?, ?)'
  );
  for (const [langCode, pairs] of Object.entries(translations)) {
    for (const [key, val] of Object.entries(pairs)) {
      insertTrans.run(langCode, key, val);
    }
  }

  // 5. Categories
  const categorySeeds = [
    {
      slug: 'appetizers',
      image: '/menu-images/food_spring_rolls_1794534821800.jpg',
      order: 1,
      en: ['Appetizers', 'Crispy starters & fresh salads'],
      km: ['អាហារសម្រន់', 'ម្ហូបចាប់ផ្តើម និងសាឡាដស្រស់'],
      zh: ['开胃菜', '香脆前菜与鲜蔬沙拉'],
      fr: ['Entrées', 'Entrées croustillantes et salades'],
    },
    {
      slug: 'main-dishes',
      image: '/menu-images/food_beef_burger_1794534818679.jpg',
      order: 2,
      en: ['Main Dishes', 'Signature burgers, grills & Khmer classics'],
      km: ['ម្ហូបចម្បង', 'ប៊ឺហ្គឺ ម្ហូបអាំង និងម្ហូបខ្មែរប្រចាំហាង'],
      zh: ['主菜', '招牌汉堡、炭烤与高棉经典'],
      fr: ['Plats Principaux', 'Burgers signature et grillades'],
    },
    {
      slug: 'rice',
      image: '/menu-images/food_fried_rice_1794534819545.jpg',
      order: 3,
      en: ['Rice', 'Wok-fried jasmine rice plates'],
      km: ['បាយ', 'បាយឆាឈ្ងុយឆ្ងាញ់'],
      zh: ['米饭类', '锅气炒饭'],
      fr: ['Riz', 'Riz sauté au wok'],
    },
    {
      slug: 'noodles',
      image: '/menu-images/food_noodle_soup_1794534821916.jpg',
      order: 4,
      en: ['Noodles', 'Handcrafted noodle soups & stir-fries'],
      km: ['គុយទាវ និងមី', 'គុយទាវស៊ុប និងមីឆា'],
      zh: ['面食', '招牌汤粉与炒面'],
      fr: ['Nouilles', 'Soupes de nouilles et sautés'],
    },
    {
      slug: 'soup',
      image: '/menu-images/food_tom_yum_soup_1794534820818.jpg',
      order: 5,
      en: ['Soup', 'Aromatic hot & sour broths'],
      km: ['សម្ល និងស៊ុប', 'ស៊ុបក្តៅៗ រសជាតិដើម'],
      zh: ['汤类', '香浓酸辣汤品'],
      fr: ['Soupes', 'Bouillons aromatiques'],
    },
    {
      slug: 'drinks',
      image: '/menu-images/food_iced_coffee_1794534822686.jpg',
      order: 6,
      en: ['Drinks & Coffee', 'Iced teas, soft drinks & specialty coffee'],
      km: ['ភេសជ្ជៈ និងកាហ្វេ', 'តែត្រជាក់ ភេសជ្ជៈ និងកាហ្វេពិសេស'],
      zh: ['饮品与咖啡', '冰茶、软饮与特色咖啡'],
      fr: ['Boissons & Café', 'Thés glacés et cafés'],
    },
  ];

  const insertCat = db.prepare('INSERT INTO categories (slug, image_url, is_active, display_order) VALUES (?, ?, 1, ?)');
  const insertCatTrans = db.prepare(
    'INSERT INTO category_translations (category_id, language_code, name, description) VALUES (?, ?, ?, ?)'
  );
  const categoryMap: Record<string, number> = {};

  for (const cat of categorySeeds) {
    const res = insertCat.run(cat.slug, cat.image, cat.order);
    const catId = Number(res.lastInsertRowid);
    categoryMap[cat.slug] = catId;
    insertCatTrans.run(catId, 'en', cat.en[0], cat.en[1]);
    insertCatTrans.run(catId, 'km', cat.km[0], cat.km[1]);
    insertCatTrans.run(catId, 'zh', cat.zh[0], cat.zh[1]);
    insertCatTrans.run(catId, 'fr', cat.fr[0], cat.fr[1]);
  }

  // 6. Menu Items + Translations + Options
  const menuSeeds = [
    {
      slug: 'beef-burger',
      cat: 'main-dishes',
      price: 7.50,
      image: '/menu-images/food_beef_burger_1794534818679.jpg',
      popular: 1,
      recommended: 1,
      isNew: 0,
      special: 0,
      prep: 14,
      en: ['Beef Burger', 'Double seared beef patty, aged cheddar, crisp lettuce, vine tomato, house sauce on toasted brioche.'],
      km: ['ប៊ឺហ្គឺសាច់គោ', 'សាច់គោអាំងពីរជាន់ ឈីសរលាយ បន្លែស្រស់ និងនំប៉័ងទន់ឈ្ងុយ។'],
      zh: ['招牌牛肉汉堡', '双层煎牛肉饼配车打芝士、生菜与布里欧修面包。'],
      options: [
        {
          name: 'Doneness / Size',
          name_km: 'ទំហំ',
          type: 'single',
          required: 1,
          values: [
            ['Single Patty', 'សាច់ ១ ជាន់', 0, 1],
            ['Double Patty', 'សាច់ ២ ជាន់', 2.5, 0],
          ],
        },
        {
          name: 'Add-ons',
          name_km: 'បន្ថែម',
          type: 'multiple',
          required: 0,
          values: [
            ['Extra Cheddar Cheese', 'បន្ថែមឈីស', 1.0, 0],
            ['Crispy Fries Side', 'បន្ថែមដំឡូងបារាំងបំពង', 2.0, 0],
            ['Fried Egg', 'បន្ថែមពងមាន់ចៀន', 1.0, 0],
          ],
        },
      ],
    },
    {
      slug: 'grilled-chicken-salad',
      cat: 'appetizers',
      price: 5.50,
      image: '/menu-images/food_chicken_salad_1794534818320.jpg',
      popular: 1,
      recommended: 1,
      isNew: 0,
      special: 0,
      prep: 10,
      en: ['Grilled Chicken Salad', 'Herb-marinated chicken breast, sliced avocado, cherry tomatoes, cucumber, roasted sesame dressing.'],
      km: ['សាឡាដសាច់មាន់អាំង', 'ទ្រូងមាន់អាំង ប័រស្រស់ ប៉េងប៉ោះ និងទឹកជ្រលក់ល្ង។'],
      zh: ['烤鸡胸沙拉', '香草烤鸡胸肉配牛油果、圣女果与焙煎芝麻酱。'],
      options: [
        {
          name: 'Dressing',
          name_km: 'ទឹកជ្រលក់',
          type: 'single',
          required: 1,
          values: [
            ['Roasted Sesame', 'ទឹកជ្រលក់ល្ង', 0, 1],
            ['Citrus Vinaigrette', 'ទឹកជ្រលក់ក្រូចឆ្មារ', 0, 0],
          ],
        },
      ],
    },
    {
      slug: 'fried-rice',
      cat: 'rice',
      price: 4.50,
      image: '/menu-images/food_fried_rice_1794534819545.jpg',
      popular: 1,
      recommended: 0,
      isNew: 0,
      special: 0,
      prep: 10,
      en: ['Seafood Fried Rice', 'Wok-tossed jasmine rice with grilled tiger prawns, egg, scallions, crisp cucumber and lime.'],
      km: ['បាយឆាគ្រឿងសមុទ្រ', 'បាយម្លិះឆាជាមួយបង្គា ស៊ុត និងខ្ទឹមស្លឹក រសជាតិឈ្ងុយឆ្ងាញ់។'],
      zh: ['海鲜炒饭', '茉莉香米配大虾、鸡蛋与青葱大火翻炒。'],
      options: [
        {
          name: 'Portion Size',
          name_km: 'ទំហំចាន',
          type: 'single',
          required: 1,
          values: [
            ['Regular', 'ធម្មតា', 0, 1],
            ['Large', 'ធំ', 1.5, 0],
          ],
        },
        {
          name: 'Spice Level',
          name_km: 'កម្រិតហិរ',
          type: 'single',
          required: 0,
          values: [
            ['Mild', 'មិនហិរ', 0, 1],
            ['Medium', 'ហិរមធ្យម', 0, 0],
            ['Extra Spicy', 'ហិរខ្លាំង', 0, 0],
          ],
        },
      ],
    },
    {
      slug: 'tom-yum-soup',
      cat: 'soup',
      price: 6.00,
      image: '/menu-images/food_tom_yum_soup_1794534820818.jpg',
      popular: 1,
      recommended: 1,
      isNew: 0,
      special: 1,
      prep: 12,
      en: ['Tom Yum Soup', 'Fragrant hot and sour broth simmered with lemongrass, kaffir lime leaves, mushrooms and river prawns.'],
      km: ['ស៊ុបតុមយ៉ាំបង្គា', 'ស៊ុបជូរហិរស្លឹកគ្រៃ ស្លឹកក្រូចសើច ផ្សិត និងបង្គាស្រស់។'],
      zh: ['冬阴功海鲜汤', '香茅青柠叶酸辣汤底配鲜虾与草菇。'],
      options: [
        {
          name: 'Spice Level',
          name_km: 'កម្រិតហិរ',
          type: 'single',
          required: 1,
          values: [
            ['Mild', 'ហិរតិច', 0, 0],
            ['Medium', 'ហិរមធ្យម', 0, 1],
            ['Thai Hot', 'ហិរខ្លាំង', 0, 0],
          ],
        },
        {
          name: 'Add-ons',
          name_km: 'បន្ថែម',
          type: 'multiple',
          required: 0,
          values: [
            ['Steamed Jasmine Rice', 'បន្ថែមបាយស', 1.0, 0],
            ['Extra Prawns', 'បន្ថែមបង្គា', 2.5, 0],
          ],
        },
      ],
    },
    {
      slug: 'spring-rolls',
      cat: 'appetizers',
      price: 2.50,
      image: '/menu-images/food_spring_rolls_1794534821800.jpg',
      popular: 0,
      recommended: 1,
      isNew: 1,
      special: 0,
      prep: 8,
      en: ['Crispy Spring Rolls', 'Golden crispy rolls stuffed with taro, glass noodles and vegetables, served with sweet chili dip.'],
      km: ['ណែមបំពងស្រួយ', 'ណែមបំពងពណ៌មាស ស្រួយឆ្ងាញ់ ញ៉ាំជាមួយបន្លែស្រស់ និងទឹកជ្រលក់។'],
      zh: ['香脆春卷', '金黄炸春卷配新鲜生菜与甜辣酱。'],
      options: [
        {
          name: 'Portion',
          name_km: 'ចំនួន',
          type: 'single',
          required: 1,
          values: [
            ['4 Pieces', '៤ ដុំ', 0, 1],
            ['8 Pieces (Sharing)', '៨ ដុំ', 2.0, 0],
          ],
        },
      ],
    },
    {
      slug: 'kuy-teav',
      cat: 'noodles',
      price: 4.00,
      image: '/menu-images/food_noodle_soup_1794534821916.jpg',
      popular: 1,
      recommended: 1,
      isNew: 0,
      special: 0,
      prep: 9,
      en: ['Kuy Teav Beef Noodle Soup', 'Traditional Cambodian rice noodle soup with clear slow-simmered broth, sliced beef, bean sprouts and herbs.'],
      km: ['គុយទាវសាច់គោ', 'គុយទាវទឹកស៊ុបថ្លាឈ្ងុយឆ្ងាញ់ សាច់គោស្រស់ សណ្តែកបណ្តុះ និងជី។'],
      zh: ['高棉牛肉粿条汤', '传统清汤粿条配嫩牛肉片、豆芽与香菜。'],
      options: [
        {
          name: 'Noodle Type',
          name_km: 'ប្រភេទសរសៃ',
          type: 'single',
          required: 1,
          values: [
            ['Rice Noodle (Kuy Teav)', 'គុយទាវ', 0, 1],
            ['Egg Noodle (Mee)', 'មីលឿង', 0, 0],
          ],
        },
        {
          name: 'Add-ons',
          name_km: 'បន្ថែម',
          type: 'multiple',
          required: 0,
          values: [
            ['Extra Beef Slices', 'បន្ថែមសាច់គោ', 1.5, 0],
            ['Beef Meatballs', 'បន្ថែមប្រហិតសាច់គោ', 1.25, 0],
          ],
        },
      ],
    },
    {
      slug: 'pad-thai',
      cat: 'noodles',
      price: 5.00,
      image: '/menu-images/food_noodle_soup_1794534821916.jpg',
      popular: 0,
      recommended: 0,
      isNew: 1,
      special: 0,
      prep: 11,
      en: ['Pad Thai', 'Tamarind stir-fried flat rice noodles with prawns, tofu, crushed peanuts, bean sprouts and lime.'],
      km: ['ផាត់ថៃ', 'គុយទាវឆាទឹកអំពិលទុំ ជាមួយបង្គា សណ្តែកដី និងក្រូចឆ្មារ។'],
      zh: ['泰式炒河粉', '罗望子酱炒河粉配鲜虾、碎花生与青柠。'],
      options: [],
    },
    {
      slug: 'iced-milk-coffee',
      cat: 'drinks',
      price: 2.25,
      image: '/menu-images/food_iced_coffee_1794534822686.jpg',
      popular: 1,
      recommended: 1,
      isNew: 0,
      special: 0,
      prep: 4,
      en: ['Iced Milk Coffee', 'Rich roasted Cambodian coffee poured over ice with creamy condensed milk.'],
      km: ['កាហ្វេទឹកដោះគោទឹកកក', 'កាហ្វេលីងឈ្ងុយឆ្ងាញ់ លាយជាមួយទឹកដោះគោខាប់ និងទឹកកក។'],
      zh: ['冰奶咖啡', '现萃咖啡搭配炼乳与冰块。'],
      options: [
        {
          name: 'Sugar Level',
          name_km: 'កម្រិតផ្អែម',
          type: 'single',
          required: 1,
          values: [
            ['100% Normal', 'ផ្អែមធម្មតា ១០០%', 0, 1],
            ['70% Less Sweet', 'ផ្អែមតិច ៧០%', 0, 0],
            ['50% Half Sweet', 'ផ្អែមពាក់កណ្តាល ៥០%', 0, 0],
          ],
        },
        {
          name: 'Ice Level',
          name_km: 'កម្រិតទឹកកក',
          type: 'single',
          required: 1,
          values: [
            ['Normal Ice', 'ទឹកកកធម្មតា', 0, 1],
            ['Less Ice', 'ទឹកកកតិច', 0, 0],
          ],
        },
      ],
    },
    {
      slug: 'iced-lemon-tea',
      cat: 'drinks',
      price: 1.75,
      image: '/menu-images/food_iced_coffee_1794534822686.jpg',
      popular: 0,
      recommended: 0,
      isNew: 0,
      special: 1,
      prep: 3,
      en: ['Iced Lemon Tea', 'Freshly brewed black tea shaken with fresh lime juice, mint leaves and cane syrup.'],
      km: ['តែក្រូចឆ្មារទឹកកក', 'តែខ្មៅស្រស់ លាយទឹកក្រូចឆ្មារ និងស្លឹកជីអង្កាមត្រជាក់ចិត្ត។'],
      zh: ['冰柠檬茶', '现泡红茶配鲜榨青柠与薄荷叶。'],
      options: [
        {
          name: 'Sugar Level',
          name_km: 'កម្រិតផ្អែម',
          type: 'single',
          required: 1,
          values: [
            ['100% Normal', 'ធម្មតា', 0, 1],
            ['50% Less Sweet', 'ផ្អែមតិច', 0, 0],
          ],
        },
      ],
    },
    {
      slug: 'coca-cola',
      cat: 'drinks',
      price: 1.50,
      image: '/menu-images/food_iced_coffee_1794534822686.jpg',
      popular: 0,
      recommended: 0,
      isNew: 0,
      special: 0,
      prep: 2,
      en: ['Coca Cola', 'Chilled 330ml can served with a glass of ice and lime slice.'],
      km: ['កូកាកូឡា', 'កូកាកូឡាត្រជាក់ បម្រើជាមួយកែវទឹកកក។'],
      zh: ['可口可乐', '冰镇可乐配冰杯与青柠片。'],
      options: [],
    },
  ];

  const insertItem = db.prepare(
    `INSERT INTO menu_items (category_id, slug, price, image_url, is_available, is_popular, is_recommended, is_new, is_special_offer, prep_time_minutes, display_order)
     VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)`
  );
  const insertItemTrans = db.prepare(
    'INSERT INTO menu_item_translations (menu_item_id, language_code, name, description) VALUES (?, ?, ?, ?)'
  );
  const insertOption = db.prepare(
    'INSERT INTO menu_item_options (menu_item_id, name, name_km, selection_type, is_required, display_order) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const insertOptVal = db.prepare(
    'INSERT INTO menu_item_option_values (option_id, label, label_km, price_delta, is_default, display_order) VALUES (?, ?, ?, ?, ?, ?)'
  );

  const itemMap: Record<string, { id: number; price: number; name: string }> = {};
  menuSeeds.forEach((m, idx) => {
    const catId = categoryMap[m.cat];
    const res = insertItem.run(catId, m.slug, m.price, m.image, m.popular, m.recommended, m.isNew, m.special, m.prep, idx + 1);
    const itemId = Number(res.lastInsertRowid);
    itemMap[m.slug] = { id: itemId, price: m.price, name: m.en[0] };

    insertItemTrans.run(itemId, 'en', m.en[0], m.en[1]);
    insertItemTrans.run(itemId, 'km', m.km[0], m.km[1]);
    insertItemTrans.run(itemId, 'zh', m.zh[0], m.zh[1]);

    m.options.forEach((opt, oIdx) => {
      const oRes = insertOption.run(itemId, opt.name, opt.name_km, opt.type, opt.required, oIdx + 1);
      const optId = Number(oRes.lastInsertRowid);
      opt.values.forEach((val, vIdx) => {
        insertOptVal.run(optId, val[0], val[1], val[2], val[3], vIdx + 1);
      });
    });
  });

  // 7. Restaurant Tables (1..10) with deterministic demo tokens for first 5 + random for rest
  const insertTable = db.prepare(
    'INSERT INTO tables (table_number, label, capacity, qr_token, is_active) VALUES (?, ?, ?, ?, 1)'
  );
  const tableIds: Record<number, number> = {};
  for (let i = 1; i <= 10; i++) {
    const token = i <= 5 ? `tbl-${i}-dineeasy-qr` : `tbl-${i}-${crypto.randomBytes(4).toString('hex')}`;
    const res = insertTable.run(i, `Table ${i}`, i <= 4 ? 2 : i <= 8 ? 4 : 6, token);
    tableIds[i] = Number(res.lastInsertRowid);
  }

  // 8. Discounts
  db.prepare("INSERT INTO discounts (code, label, discount_type, value, is_active) VALUES ('MEMBER10', 'Member 10% Off', 'percent', 10, 1)").run();
  db.prepare("INSERT INTO discounts (code, label, discount_type, value, is_active) VALUES ('VIP20', 'VIP 20% Off', 'percent', 20, 1)").run();
  db.prepare("INSERT INTO discounts (code, label, discount_type, value, is_active) VALUES ('PROMO2', '$2.00 Voucher', 'fixed', 2, 1)").run();

  // 9. Expense Categories & Sample Expenses
  const expCat1 = Number(
    db.prepare("INSERT INTO expense_categories (name, description) VALUES ('Ingredients & Produce', 'Fresh vegetables, meats, seafood')").run().lastInsertRowid
  );
  const expCat2 = Number(
    db.prepare("INSERT INTO expense_categories (name, description) VALUES ('Utilities & Gas', 'Electricity, water, cooking gas')").run().lastInsertRowid
  );
  db.prepare(
    "INSERT INTO expenses (expense_category_id, description, amount, expense_date, created_by) VALUES (?, 'Morning fresh market produce & prawns', 64.50, date('now'), 1)"
  ).run(expCat1);
  db.prepare(
    "INSERT INTO expenses (expense_category_id, description, amount, expense_date, created_by) VALUES (?, 'Kitchen cooking gas refill', 28.00, date('now', '-1 day'), 1)"
  ).run(expCat2);

  // 10. Seed Historical Completed Sessions/Orders/Payments (for realistic Admin analytics & charts)
  const insertSession = db.prepare(
    'INSERT INTO table_sessions (table_id, session_code, opened_at, closed_at, status) VALUES (?, ?, ?, ?, ?)'
  );
  const insertOrder = db.prepare(
    `INSERT INTO orders (session_id, staff_id, order_number, status, notes, total_amount, confirmed_at, cooking_started_at, ready_at, served_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertOrderItem = db.prepare(
    'INSERT INTO order_items (order_id, menu_item_id, item_name_snapshot, quantity, unit_price, subtotal, selected_options_json, special_instructions) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const insertPayment = db.prepare(
    'INSERT INTO payments (session_id, amount, subtotal_amount, discount_amount, tax_amount, service_charge_amount, method, status, verified_by, reference_note, paid_at, created_at) VALUES (?, ?, ?, 0, 0, 0, ?, ?, ?, ?, ?, ?)'
  );
  const insertReceipt = db.prepare(
    'INSERT INTO receipts (payment_id, session_id, receipt_number, issued_by, receipt_data_json, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  );

  const historicalSamples = [
    { table: 6, hoursAgo: 28, method: 'khqr', items: [['beef-burger', 2], ['iced-milk-coffee', 2]] as Array<[string, number]> },
    { table: 2, hoursAgo: 26, method: 'cash', items: [['fried-rice', 2], ['tom-yum-soup', 1], ['coca-cola', 2]] as Array<[string, number]> },
    { table: 4, hoursAgo: 22, method: 'khqr', items: [['kuy-teav', 3], ['spring-rolls', 2]] as Array<[string, number]> },
    { table: 7, hoursAgo: 5, method: 'khqr', items: [['grilled-chicken-salad', 2], ['beef-burger', 1], ['iced-lemon-tea', 2]] as Array<[string, number]> },
    { table: 9, hoursAgo: 3, method: 'khqr', items: [['tom-yum-soup', 2], ['fried-rice', 2], ['coca-cola', 3]] as Array<[string, number]> },
    { table: 10, hoursAgo: 1.5, method: 'cash', items: [['kuy-teav', 2], ['spring-rolls', 1], ['iced-milk-coffee', 2]] as Array<[string, number]> },
  ];

  historicalSamples.forEach((sample, idx) => {
    const dt = new Date(Date.now() - sample.hoursAgo * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 19);
    const sRes = insertSession.run(tableIds[sample.table], `SES-HIST-${100 + idx}`, dt, dt, 'closed');
    const sessId = Number(sRes.lastInsertRowid);

    let total = 0;
    const itemSnapshots: Array<{ name: string; qty: number; price: number; subtotal: number }> = [];
    for (const [slug, qty] of sample.items) {
      const m = itemMap[slug];
      const sub = Number((m.price * qty).toFixed(2));
      total += sub;
      itemSnapshots.push({ name: m.name, qty, price: m.price, subtotal: sub });
    }
    total = Number(total.toFixed(2));

    const orderNum = `ORD-${1020 + idx}`;
    const oRes = insertOrder.run(sessId, staffId, orderNum, 'completed', '', total, dt, dt, dt, dt, dt, dt);
    const orderId = Number(oRes.lastInsertRowid);
    for (const [slug, qty] of sample.items) {
      const m = itemMap[slug];
      insertOrderItem.run(orderId, m.id, m.name, qty, m.price, Number((m.price * qty).toFixed(2)), '[]', '');
    }

    const pRes = insertPayment.run(sessId, total, total, sample.method, 'paid', staffId, 'Verified settlement', dt, dt);
    const payId = Number(pRes.lastInsertRowid);
    insertReceipt.run(
      payId,
      sessId,
      `RCP-${1020 + idx}`,
      staffId,
      JSON.stringify({
        receipt_number: `RCP-${1020 + idx}`,
        table_number: sample.table,
        order_numbers: [orderNum],
        items: itemSnapshots,
        subtotal: total,
        discount: 0,
        tax: 0,
        service_charge: 0,
        total,
        method: sample.method,
        staff_name: 'Sokha',
        paid_at: dt,
      }),
      dt
    );
  });

  // 11. Active Live Table Sessions (matching the Showcase screenshot so KDS, Staff & Table 5 Customer are immediately rich!)
  // Table 5: Active session with Order #1234 (Cooking) + ready to test Checkout
  const nowSql = new Date(Date.now() - 8 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);
  const sesT5 = Number(insertSession.run(tableIds[5], 'SES-LIVE-T5', nowSql, null, 'active').lastInsertRowid);
  const ordT5 = Number(
    insertOrder.run(sesT5, staffId, 'ORD-1234', 'cooking', 'No onions on burger', 17.50, nowSql, nowSql, null, null, nowSql, nowSql).lastInsertRowid
  );
  insertOrderItem.run(ordT5, itemMap['beef-burger'].id, 'Beef Burger', 1, 7.50, 7.50, '[]', 'No onions');
  insertOrderItem.run(ordT5, itemMap['fried-rice'].id, 'Seafood Fried Rice', 1, 4.50, 4.50, '[]', '');
  insertOrderItem.run(ordT5, itemMap['coca-cola'].id, 'Coca Cola', 2, 1.50, 3.00, '[]', 'With ice');
  insertOrderItem.run(ordT5, itemMap['spring-rolls'].id, 'Crispy Spring Rolls', 1, 2.50, 2.50, '[]', '');

  // Table 1: Active session (Cooking)
  const mins12 = new Date(Date.now() - 12 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);
  const sesT1 = Number(insertSession.run(tableIds[1], 'SES-LIVE-T1', mins12, null, 'active').lastInsertRowid);
  const ordT1 = Number(
    insertOrder.run(sesT1, staffId, 'ORD-1231', 'cooking', '', 11.25, mins12, mins12, null, null, mins12, mins12).lastInsertRowid
  );
  insertOrderItem.run(ordT1, itemMap['beef-burger'].id, 'Beef Burger', 1, 7.50, 7.50, '[]', '');
  insertOrderItem.run(ordT1, itemMap['iced-lemon-tea'].id, 'Iced Lemon Tea', 1, 1.75, 1.75, '[]', '');
  insertOrderItem.run(ordT1, itemMap['coca-cola'].id, 'Coca Cola', 1, 1.50, 1.50, '[]', '');

  // Table 3: Active session (Ready - awaiting Staff delivery)
  const mins7 = new Date(Date.now() - 7 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);
  const sesT3 = Number(insertSession.run(tableIds[3], 'SES-LIVE-T3', mins7, null, 'active').lastInsertRowid);
  const ordT3 = Number(
    insertOrder.run(sesT3, staffId, 'ORD-1232', 'ready', '', 13.00, mins7, mins7, mins7, null, mins7, mins7).lastInsertRowid
  );
  insertOrderItem.run(ordT3, itemMap['grilled-chicken-salad'].id, 'Grilled Chicken Salad', 1, 5.50, 5.50, '[]', '');
  insertOrderItem.run(ordT3, itemMap['tom-yum-soup'].id, 'Tom Yum Soup', 1, 6.00, 6.00, '[]', 'Medium spice');
  insertOrderItem.run(ordT3, itemMap['coca-cola'].id, 'Coca Cola', 1, 1.50, 1.50, '[]', '');

  // Table 8: New customer order placed (Awaiting Staff confirmation!)
  const mins2 = new Date(Date.now() - 2 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);
  const sesT8 = Number(insertSession.run(tableIds[8], 'SES-LIVE-T8', mins2, null, 'active').lastInsertRowid);
  const ordT8 = Number(
    insertOrder.run(sesT8, null, 'ORD-1235', 'placed', 'Serve drinks first please', 7.25, null, null, null, null, mins2, mins2).lastInsertRowid
  );
  insertOrderItem.run(ordT8, itemMap['pad-thai'].id, 'Pad Thai', 1, 5.00, 5.00, '[]', '');
  insertOrderItem.run(ordT8, itemMap['iced-milk-coffee'].id, 'Iced Milk Coffee', 1, 2.25, 2.25, '[]', '70% Less Sweet');

  db.prepare(
    "INSERT INTO notifications (target_role, type, title, message, order_id, table_id, is_read) VALUES ('staff', 'order:created', 'New Order #ORD-1235', 'Table 8 ordered Pad Thai x1, Iced Milk Coffee x1', ?, ?, 0)"
  ).run(ordT8, tableIds[8]);

  db.prepare(
    "INSERT INTO notifications (target_role, type, title, message, order_id, table_id, is_read) VALUES ('staff', 'order:ready', 'Order #ORD-1232 Ready', 'Table 3 order is ready at the kitchen pass', ?, ?, 0)"
  ).run(ordT3, tableIds[3]);

  console.log('Seed completed successfully.');
}
