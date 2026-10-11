-- Seed demo data (safe to run after 0001)
insert into public.news_articles (title, slug, excerpt, body) values
('انطلاق موسم MODYX الجديد 🔥', 'season-launch', 'بطولات Solo و Squad بجوائز أسبوعية', 'أهلاً بكم في موسم MODYX الجديد. سجّل في البطولات الأسبوعية، كوّن فريقك، واصعد للترتيب. سيتم نشر الغرف قبل المباراة بساعة للمشاركين فقط.'),
('تحديث نظام النقاط', 'points-system', 'كيف تُحتسب نقاط الترتيب؟', 'النقاط = نقاط المركز + نقطة لكل Kill. تُعتمد النتائج من المشرف قبل ظهورها رسميًا في الترتيب.'),
('قواعد اللعب النظيف', 'fair-play', 'ممنوع الغش والحسابات المكررة', 'أي غش أو إساءة يؤدي لإيقاف الحساب وإلغاء النتائج. العب نظيفًا واستمتع.')
on conflict (slug) do nothing;

insert into public.achievements (code, title, description, points) values
('first-blood', 'البداية القوية', 'سجّل في أول بطولة', 10),
('team-founder', 'مؤسس فريق', 'أنشئ فريقك الأول', 20),
('top-3', 'منصة التتويج', 'احتل مركزًا ضمن أول 3', 50),
('champion', 'بطل MODYX', 'افُز ببطولة كاملة', 100)
on conflict (code) do nothing;

insert into public.site_settings (key, value) values
('announcement', '{"text": "التسجيل مفتوح لبطولة الجمعة الكبرى 🔥"}')
on conflict (key) do nothing;
