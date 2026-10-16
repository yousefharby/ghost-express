/* Ghost Express — default content and reference data.
   Settings and prices below are the starting values; the admin panel
   (admin.html) can change them without touching this file. */
(function () {
  var GX = (window.GX = window.GX || {});

  GX.defaults = {
    settings: {
      phone: '01145454161',
      whatsapp: '01145454161',
      email: '',
      address: '',
      mapsUrl: '',
      hours: 'كل يوم من 10 الصبح لـ 10 بالليل',
      facebook: 'https://www.facebook.com/profile.php?id=61593965482105',
      instagram: 'https://www.instagram.com/ghostexpress.24',
      tiktok: '',
      systemUrl: '',
      trackUrl: '',
      androidUrl: '',
      iosUrl: '',
      courierUrl: '',
      stats: [
        { value: '27', label: 'محافظة بنوصل لها' },
        { value: '24 ساعة', label: 'توصيل جوه القاهرة والجيزة' },
        { value: 'نفس اليوم', label: 'استلام الشحنات من عندك' },
        { value: '24/7', label: 'متابعة لحظية لكل شحنة' }
      ]
    },

    prices: {
      tiers: [
        { id: 'bronze', name: 'برونزي', range: '1 – 99 شحنة في الشهر' },
        { id: 'silver', name: 'فضي', range: '100 – 300 شحنة في الشهر' },
        { id: 'gold', name: 'ذهبي', range: '301 – 1000 شحنة في الشهر' },
        { id: 'ghost', name: 'جوست', range: 'أكتر من 1000 شحنة في الشهر' }
      ],
      zones: [
        { id: 'z1', name: 'القاهرة والجيزة', time: '24 ساعة', prices: { bronze: 80, silver: 77, gold: 74, ghost: 70 } },
        { id: 'z2', name: 'المدن الجديدة والأطراف', time: '24 – 48 ساعة', prices: { bronze: 90, silver: 87, gold: 84, ghost: 80 } },
        { id: 'z3', name: 'الإسكندرية', time: '24 – 48 ساعة', prices: { bronze: 95, silver: 92, gold: 88, ghost: 85 } },
        { id: 'z4', name: 'الدلتا ومدن القناة', time: '2 – 3 أيام', prices: { bronze: 100, silver: 97, gold: 94, ghost: 90 } },
        { id: 'z5', name: 'شمال الصعيد', time: '3 أيام', prices: { bronze: 110, silver: 107, gold: 104, ghost: 100 } },
        { id: 'z6', name: 'جنوب الصعيد', time: '3 – 4 أيام', prices: { bronze: 120, silver: 117, gold: 114, ghost: 110 } },
        { id: 'z7', name: 'المحافظات الحدودية', time: '4 – 5 أيام', prices: { bronze: 150, silver: 147, gold: 144, ghost: 140 } }
      ],
      notes: [
        'الأسعار بالجنيه المصري للشحنة الواحدة، وشاملة التوصيل لحد باب العميل.',
        'لو الشحنة محتاجة تغليف أو طباعة بوليصة من عندنا بتتضاف رسوم بسيطة.',
        'الشحنات التقيلة (أكتر من 3 كيلو) ليها تكلفة إضافية لكل كيلو زيادة.'
      ]
    }
  };

  /* Governorates → delivery zone. z2 (new cities) is an area inside
     Cairo/Giza/Sharqia/Qalyubia, so it appears as its own lookup option. */
  GX.governorates = [
    { id: 'EG-C', name: 'القاهرة', zone: 'z1' },
    { id: 'EG-GZ', name: 'الجيزة', zone: 'z1' },
    { id: 'NEW', name: 'المدن الجديدة (أكتوبر، زايد، التجمع، الشروق، العبور، بدر، العاشر)', zone: 'z2', virtual: true },
    { id: 'EG-ALX', name: 'الإسكندرية', zone: 'z3' },
    { id: 'EG-KB', name: 'القليوبية', zone: 'z4' },
    { id: 'EG-MNF', name: 'المنوفية', zone: 'z4' },
    { id: 'EG-GH', name: 'الغربية', zone: 'z4' },
    { id: 'EG-DK', name: 'الدقهلية', zone: 'z4' },
    { id: 'EG-SHR', name: 'الشرقية', zone: 'z4' },
    { id: 'EG-KFS', name: 'كفر الشيخ', zone: 'z4' },
    { id: 'EG-BH', name: 'البحيرة', zone: 'z4' },
    { id: 'EG-DT', name: 'دمياط', zone: 'z4' },
    { id: 'EG-PTS', name: 'بورسعيد', zone: 'z4' },
    { id: 'EG-IS', name: 'الإسماعيلية', zone: 'z4' },
    { id: 'EG-SUZ', name: 'السويس', zone: 'z4' },
    { id: 'EG-FYM', name: 'الفيوم', zone: 'z5' },
    { id: 'EG-BNS', name: 'بني سويف', zone: 'z5' },
    { id: 'EG-MN', name: 'المنيا', zone: 'z5' },
    { id: 'EG-AST', name: 'أسيوط', zone: 'z6' },
    { id: 'EG-SHG', name: 'سوهاج', zone: 'z6' },
    { id: 'EG-KN', name: 'قنا', zone: 'z6' },
    { id: 'EG-LX', name: 'الأقصر', zone: 'z6' },
    { id: 'EG-ASN', name: 'أسوان', zone: 'z6' },
    { id: 'EG-BA', name: 'البحر الأحمر', zone: 'z7' },
    { id: 'EG-MT', name: 'مطروح', zone: 'z7' },
    { id: 'EG-WAD', name: 'الوادي الجديد', zone: 'z7' },
    { id: 'EG-SIN', name: 'شمال سيناء', zone: 'z7' },
    { id: 'EG-JS', name: 'جنوب سيناء', zone: 'z7' }
  ];

  GX.businessTypes = [
    'ملابس وأحذية',
    'إكسسوارات وشنط',
    'مستحضرات تجميل وعناية',
    'صيدلية ومكملات',
    'إلكترونيات وموبايلات',
    'أدوات منزلية وديكور',
    'هدايا ولعب أطفال',
    'كتب وأدوات مكتبية',
    'أكل وحلويات مغلفة',
    'شركة أو موزع',
    'حاجة تانية'
  ];

  GX.messageTypes = [
    { id: 'general', name: 'استفسار عام' },
    { id: 'shipment', name: 'متابعة شحنة أو شكوى' },
    { id: 'account', name: 'فتح حساب تاجر' },
    { id: 'integration', name: 'ربط متجر إلكتروني' },
    { id: 'courier', name: 'عايز أشتغل مندوب' }
  ];

  GX.statuses = {
    registrations: [
      { id: 'new', name: 'جديد' },
      { id: 'contacted', name: 'اتكلمنا معاه' },
      { id: 'active', name: 'الحساب اتفعل' },
      { id: 'rejected', name: 'مرفوض' }
    ],
    messages: [
      { id: 'new', name: 'جديدة' },
      { id: 'read', name: 'اتقرت' },
      { id: 'done', name: 'اتحلت' }
    ]
  };
})();
