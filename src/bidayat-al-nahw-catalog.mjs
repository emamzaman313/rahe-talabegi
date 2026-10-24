/**
 * Catalog transcribed from the Arabic table of contents in the user-provided
 * scanned PDF "بداية النحو". These are headings, not a replacement for the book.
 * Page-level mappings are intentionally omitted until each TOC entry is checked against the scanned Arabic pages.
 */
export const BIDAYAT_AL_NAHW = Object.freeze({
  id: 'bidayat-al-nahw',
  titleArabic: 'بداية النحو',
  titlePersian: 'بدایة النحو',
  language: 'ar',
  sourceType: 'scanned-pdf',
  pdfPages: 150,
  tocPdfPages: Object.freeze([7, 8, 9, 10]),
  chapters: Object.freeze([
    {
      id: 'introduction',
      titleArabic: 'المقدمة',
      titlePersian: 'مقدمه',
      topics: Object.freeze([
        { id: 'nahw-definition', titleArabic: 'معرفة علم النحو', titlePersian: 'شناخت علم نحو' },
        { id: 'word-types', titleArabic: 'معرفة الكلمة وأقسامها', titlePersian: 'شناخت کلمه و اقسام آن' },
        { id: 'sentence-types', titleArabic: 'الجملة وأقسامها', titlePersian: 'جمله و اقسام آن' },
        { id: 'noun', titleArabic: 'فصل في الاسم', titlePersian: 'فصل اسم' },
        { id: 'verb', titleArabic: 'فصل في الفعل', titlePersian: 'فصل فعل' },
        { id: 'particle', titleArabic: 'فصل في الحرف', titlePersian: 'فصل حرف' },
        { id: 'inflection-building', titleArabic: 'الإعراب والبناء', titlePersian: 'اعراب و بنا' },
        { id: 'inflection-types', titleArabic: 'أنواع الإعراب', titlePersian: 'انواع اعراب' },
        { id: 'inflection-marks', titleArabic: 'علامات الإعراب', titlePersian: 'علامت‌های اعراب' },
        { id: 'building', titleArabic: 'البناء', titlePersian: 'بنا' },
      ]),
    },
    {
      id: 'nominatives',
      titleArabic: 'المقصد الأول: المرفوعات',
      titlePersian: 'مقصد اول: مرفوعات',
      topics: Object.freeze([
        { id: 'subject-doer', titleArabic: 'الفاعل', titlePersian: 'فاعل' },
        { id: 'passive-subject', titleArabic: 'نائب الفاعل', titlePersian: 'نائب فاعل' },
        { id: 'subject', titleArabic: 'المبتدأ', titlePersian: 'مبتدا' },
        { id: 'predicate', titleArabic: 'الخبر', titlePersian: 'خبر' },
        { id: 'incomplete-verbs', titleArabic: 'الأفعال الناقصة', titlePersian: 'افعال ناقصه' },
        { id: 'approach-verbs', titleArabic: 'الأفعال المقاربة', titlePersian: 'افعال مقاربه' },
        { id: 'like-laysa', titleArabic: 'الحروف المشبهة بليس', titlePersian: 'حروف شبیه به لیس' },
        { id: 'like-verbs', titleArabic: 'الحروف المشبهة بالفعل', titlePersian: 'حروف مشبه به فعل' },
        { id: 'heart-verbs', titleArabic: 'أفعال القلوب', titlePersian: 'افعال قلوب' },
      ]),
    },
    {
      id: 'accusatives',
      titleArabic: 'المقصد الثاني: المنصوبات',
      titlePersian: 'مقصد دوم: منصوبات',
      topics: Object.freeze([
        { id: 'object', titleArabic: 'المفعول به', titlePersian: 'مفعول‌به' },
        { id: 'specification', titleArabic: 'الاختصاص', titlePersian: 'اختصاص' },
        { id: 'exhortation', titleArabic: 'الإغراء', titlePersian: 'اغراء' },
        { id: 'warning', titleArabic: 'التحذير', titlePersian: 'تحذیر' },
        { id: 'preoccupation', titleArabic: 'الاشتغال', titlePersian: 'اشتغال' },
        { id: 'absolute-object', titleArabic: 'المفعول المطلق', titlePersian: 'مفعول مطلق' },
        { id: 'causal-object', titleArabic: 'المفعول له', titlePersian: 'مفعول‌له' },
        { id: 'locative-object', titleArabic: 'المفعول فيه', titlePersian: 'مفعول‌فیه' },
        { id: 'comitative-object', titleArabic: 'المفعول معه', titlePersian: 'مفعول‌معه' },
        { id: 'circumstantial-accusative', titleArabic: 'الحال', titlePersian: 'حال' },
        { id: 'specification-tamyiz', titleArabic: 'التمييز', titlePersian: 'تمییز' },
        { id: 'vocative', titleArabic: 'المنادى', titlePersian: 'منادا' },
      ]),
    },
    {
      id: 'genitives',
      titleArabic: 'المقصد الثالث: المجرورات',
      titlePersian: 'مقصد سوم: مجرورات',
      topics: Object.freeze([
        { id: 'idafa', titleArabic: 'الإضافة', titlePersian: 'اضافه' },
        { id: 'prepositions', titleArabic: 'حروف الجر', titlePersian: 'حروف جر' },
      ]),
    },
    {
      id: 'jussives',
      titleArabic: 'المقصد الرابع: المجزومات',
      titlePersian: 'مقصد چهارم: مجزومات',
      topics: Object.freeze([{ id: 'jussive-verbs', titleArabic: 'المجزومات', titlePersian: 'مجزومات' }]),
    },
    {
      id: 'dependents',
      titleArabic: 'المقصد الخامس: التوابع',
      titlePersian: 'مقصد پنجم: توابع',
      topics: Object.freeze([
        { id: 'adjective', titleArabic: 'النعت', titlePersian: 'نعت' },
        { id: 'substitution', titleArabic: 'البدل', titlePersian: 'بدل' },
        { id: 'apposition', titleArabic: 'عطف البيان', titlePersian: 'عطف بیان' },
        { id: 'emphasis', titleArabic: 'التوكيد', titlePersian: 'تأکید' },
        { id: 'coordination', titleArabic: 'عطف النسق', titlePersian: 'عطف نسق' },
      ]),
    },
    {
      id: 'working-nouns',
      titleArabic: 'المقصد السادس: الأسماء العاملة',
      titlePersian: 'مقصد ششم: اسم‌های عامل',
      topics: Object.freeze([
        { id: 'verbal-noun', titleArabic: 'المصدر', titlePersian: 'مصدر' },
        { id: 'active-participle', titleArabic: 'اسم الفاعل', titlePersian: 'اسم فاعل' },
        { id: 'passive-participle', titleArabic: 'اسم المفعول', titlePersian: 'اسم مفعول' },
        { id: 'adjective-of-resemblance', titleArabic: 'الصفة المشبهة', titlePersian: 'صفت مشبهه' },
        { id: 'comparative', titleArabic: 'اسم التفضيل', titlePersian: 'اسم تفضیل' },
        { id: 'verbal-noun-of-command', titleArabic: 'اسم الفعل', titlePersian: 'اسم فعل' },
      ]),
    },
    {
      id: 'non-requested-constructive-verbs',
      titleArabic: 'المقصد السابع: الأفعال الإنشائية غير الطلبية',
      titlePersian: 'مقصد هفتم: افعال انشایی غیرطلبی',
      topics: Object.freeze([
        { id: 'praise-blame', titleArabic: 'أفعال المدح والذم', titlePersian: 'افعال مدح و ذم' },
        { id: 'wonder', titleArabic: 'أفعال التعجب', titlePersian: 'افعال تعجب' },
      ]),
    },
    {
      id: 'particles',
      titleArabic: 'المقصد الثامن: الأدوات',
      titlePersian: 'مقصد هشتم: ادوات',
      topics: Object.freeze([
        { id: 'condition', titleArabic: 'أداة الشرط', titlePersian: 'ادات شرط' },
        { id: 'interrogation', titleArabic: 'أداة الاستفهام', titlePersian: 'ادات استفهام' },
        { id: 'answer', titleArabic: 'أداة الجواب', titlePersian: 'ادات جواب' },
        { id: 'simile', titleArabic: 'أداة التشبيه', titlePersian: 'ادات تشبیه' },
        { id: 'presentation', titleArabic: 'أداة العرض والتخصيص والتوبيخ', titlePersian: 'ادات عرض، تخصیص و توبیخ' },
        { id: 'detail', titleArabic: 'أداة التفصيل', titlePersian: 'ادات تفصیل' },
        { id: 'masdariyya', titleArabic: 'الأداة المصدرية', titlePersian: 'ادات مصدریه' },
        { id: 'future', titleArabic: 'أداة الاستقبال', titlePersian: 'ادات استقبال' },
        { id: 'surprise', titleArabic: 'أداة المفاجأة', titlePersian: 'ادات مفاجأه' },
        { id: 'vocative-particle', titleArabic: 'أداة النداء', titlePersian: 'ادات ندا' },
        { id: 'exception', titleArabic: 'أداة الاستثناء', titlePersian: 'ادات استثنا' },
        { id: 'restriction', titleArabic: 'أداة القصر', titlePersian: 'ادات قصر' },
        { id: 'deterrence', titleArabic: 'أداة الردع والزجر', titlePersian: 'ادات ردع و زجر' },
        { id: 'negation', titleArabic: 'أداة النفي', titlePersian: 'ادات نفی' },
      ]),
    },
    {
      id: 'sentence-and-speech',
      titleArabic: 'المقصد التاسع: الجملة والكلام',
      titlePersian: 'مقصد نهم: جمله و کلام',
      topics: Object.freeze([{ id: 'sentence-speech', titleArabic: 'الجملة والكلام', titlePersian: 'جمله و کلام' }]),
    },
    {
      id: 'numbers',
      titleArabic: 'الخاتمة: أسماء العدد',
      titlePersian: 'خاتمه: اسم‌های عدد',
      topics: Object.freeze([
        { id: 'cardinal-number', titleArabic: 'العدد الأصلي', titlePersian: 'عدد اصلی' },
        { id: 'ordinal-number', titleArabic: 'العدد الترتيبي', titlePersian: 'عدد ترتیبی' },
        { id: 'multiplicative-number', titleArabic: 'العدد التكثيري', titlePersian: 'عدد تکثیری' },
      ]),
    },
    {
      id: 'sources',
      titleArabic: 'المصادر والمآخذ',
      titlePersian: 'منابع و مآخذ',
      topics: Object.freeze([]),
    },
  ]),
});

export function flattenBidayatTopics(catalog = BIDAYAT_AL_NAHW) {
  return catalog.chapters.flatMap((chapter) => [
    { id: chapter.id, chapterId: chapter.id, titleArabic: chapter.titleArabic, titlePersian: chapter.titlePersian, kind: 'chapter' },
    ...chapter.topics.map((topic) => ({ ...topic, chapterId: chapter.id, kind: 'topic' })),
  ]);
}
