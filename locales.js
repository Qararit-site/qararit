/* سجلّ اللغات: إضافة لغة جديدة = سطر هنا + ملفات ترجمتها في i18n/ui و i18n/family و data/content.
   لا يحتاج ذلك أي تعديل في الواجهة. ترتيب القائمة هو ترتيب ظهورها في زر اللغة. */
window.QARARIT_LOCALES = {
  source: "ar",                 // لغة المحتوى المرجعية: النص النبوي العربي لا يُستبدل أبدًا
  list: [
    { code: "ar", name: "العربية", dir: "rtl", intl: "ar", nums: "latn", familyNums: "arab",
      fonts: "family=Amiri:wght@400;700&family=IBM+Plex+Sans+Arabic:wght@400;500;600" },
    { code: "en", name: "English", dir: "ltr", intl: "en",
      fonts: "family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Serif:ital,wght@0,400;0,600;1,400" },
    { code: "ur", name: "اردو", dir: "rtl", intl: "ur", nums: "latn",
      fonts: "family=Noto+Nastaliq+Urdu:wght@400;600&family=Noto+Sans+Arabic:wght@400;500;600" },
    { code: "id", name: "Bahasa Indonesia", dir: "ltr", intl: "id",
      fonts: "family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Serif:ital,wght@0,400;0,600;1,400" },
    { code: "fr", name: "Français", dir: "ltr", intl: "fr",
      fonts: "family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Serif:ital,wght@0,400;0,600;1,400" }
  ],
  // ما يُعرض من ترجمات المحتوى (الأحاديث والأسئلة). النشر العام: المعتمد فقط.
  publish: ["approved"],
  // نسخة المعاينة: تعرض أيضًا المسودات مع وسم «ترجمة أولية لم تُراجَع» على كل بطاقة.
  // اجعلها false قبل الإطلاق العام.
  preview: true,
  previewStatuses: ["draft"],
  // روابط مستقلة لكل لغة (/en/ و/fr/...) حين تولّدها tools/build_i18n.py. تُعطَّل في المعاينة.
  pathUrls: true
};
