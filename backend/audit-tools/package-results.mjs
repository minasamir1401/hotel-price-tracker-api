import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const dir=path.resolve('outputs/october-2026-live');
const report=JSON.parse(await fs.readFile(path.join(dir,'report.json'),'utf8'));
assert.equal(report.cases.length,18);assert.equal(report.availableDates+report.unavailableDates+report.errorDates,558);
assert.ok(report.cases.every(c=>c.status==='verified'&&c.errors.length===0&&c.datesAttempted===31));
let workbooks=0;
const missing=[],entries=[];
for(const c of report.cases) {
  const audit=JSON.parse(await fs.readFile(path.join(dir,c.id,'audit.json'),'utf8'));
  const latest=Object.values(Object.fromEntries(audit.nights.map(n=>[n.payload.checkIn,n])));
  for(const n of latest)if(n.roomCount===0)missing.push(`${c.hotel} — ${c.source==='almatar'?'المطار':'المسافر'} — ${c.rooms} غرفة، ${c.adultsPerRoom} بالغين لكل غرفة — ${n.payload.checkIn}`);
  const files=(await fs.readdir(path.join(dir,c.id))).filter(f=>f.endsWith('.xlsx'));
  assert.equal(files.length,c.exportedRoomWorkbooks);workbooks+=files.length;
  for(const file of [`${c.id}.xlsx`,...files.map(f=>`${c.id}/${f}`)])entries.push({file,sha256:crypto.createHash('sha256').update(await fs.readFile(path.join(dir,file))).digest('hex')});
}
assert.equal(workbooks,report.cases.reduce((s,c)=>s+c.roomVariants,0));
const http=JSON.parse(await fs.readFile(path.join(dir,'http-occupancy-tests.json'),'utf8'));assert.equal(http.results.length,6);assert.ok(http.results.every(r=>r.result.success));
const text=`# نتائج فحص الأسعار الحية — أكتوبر 2026

نجحت مطابقة البيانات وتصدير Excel ضمن نطاق الاختبار: 18 حالة، 558 يومًا، ${report.rawOfferMatches.toLocaleString('en-US')} سعرًا مطابقًا لرد المصدر. تم الاستعلام يوم 1 أكتوبر 2026 من ${report.cases.map(c=>c.queriedFrom).sort()[0]} إلى ${report.cases.map(c=>c.queriedTo).sort().at(-1)} (UTC).

## الفنادق وحالات الإشغال

- المسافر: كينجزجيت ديار، ميلينيوم مكة النسيم، مكة العزيزية.
- المطار: إم الدانة مكة، ميلينيوم مكة النسيم، أبراج الكسوة.
- لكل فندق: غرفة لبالغ واحد، غرفة لبالغين، وغرفتان لبالغين في كل غرفة (إجمالي 4 بالغين). بدون أطفال أو فلتر سراير.
- 31 ليلة مستقلة من 2026-10-01 حتى 2026-10-31؛ مغادرة آخر ليلة 2026-11-01.

## الملفات

ملفات Excel الثمانية عشر الموجودة مباشرة في المجلد تعرض الغرفة الأولى المختارة افتراضيًا، وكل ملف يحتوي جدولًا يوميًا من 31 سطرًا ودليلًا لباقي عروض الغرف. ملفات كل الغرف القابلة للاختيار موجودة في مجلدات الحالات: ${workbooks} ملفًا إضافيًا، لكل منها الجدول اليومي الخاص بتلك الغرفة. المصدر والوجبات والسراير ورابط الحجز محفوظة.

معاني أسماء الملفات: 1room-1adult = غرفة لبالغ؛ 1room-2adults = غرفة لبالغين؛ 2rooms-2adults-each = غرفتان، بالغين لكل غرفة. عدد البالغين في البيانات لكل غرفة؛ إجمالي البالغين موضح منفصلًا.

## ماذا تم التحقق منه

- استخدام محركات الموقع الحية نفسها، مع تسجيل الطلب والرد والتوقيت وحالة HTTP، وانتظار اكتمال عروض المصدر.
- ربط كل سعر منشور بمعرّف الباقة في رد المصدر النهائي لذلك التاريخ؛ مطابقة هوية الفندق والوجبة وعدد الغرف والبالغين.
- سعر المطار يطبق تقريب إجمالي الباقة للأعلى كما تعرضه صفحة المصدر، ثم يقسمه على عدد الغرف؛ قيمة المصدر قبل التقريب محفوظة في أدلة المطابقة. سعر الغرفتين صادر من طلب غرفتين فعلي.
- مجموع الليالي يحسب من الأسعار اليومية الفعلية لكل الغرف، ويبقى غير متاح إن كانت الخطة غير متاحة طوال الفترة. الأيام والأسعار الناقصة لا تستبدل بصفر أو بسعر يوم آخر.
- إنشاء الملفات باستخدام مُصدّر Excel الفعلي للموقع، وإعادة قراءتها ومطابقة كل يوم وكل عمود سعر لكل غرفة قابلة للاختيار.
- نجحت 6 طلبات عبر API الواجهة على المنفذ 5173 للمصدرين وحالات الإشغال الثلاث. نجح زر التصدير في الواجهة دون خطأ JavaScript؛ تم التحقق من محتوى الملفات بالإنشاء وإعادة القراءة، ولم يتم تأكيد حفظ تنزيل المتصفح في مجلد Downloads.
- نجح 23 اختبارًا للخادم و5 اختبارات للواجهة ونسخة الإنتاج. تمت مراجعة عينتين من Excel بصريًا. يظهر تحذير حجم حزمة JavaScript أثناء البناء، دون فشل.

## التوفر الفعلي

${report.availableDates} يومًا بها عروض، ${report.unavailableDates} أيام بدون عروض بعد إعادة الاستعلام، و${report.errorDates} أخطاء اتصال نهائية. الأيام بدون عروض:

${missing.map(v=>`- ${v}`).join('\n')}

قد تغيب غرفة معينة أو وجبة معينة في أيام أخرى رغم وجود عروض لفندق اليوم؛ تظل تلك الخلايا «غير متاح». أرقام التوفر أعلاه تخص وجود أي عرض للفندق وحالة الإشغال في ذلك اليوم.

## أدلة المراجعة وحدود النتيجة

report.json يلخص الحالات؛ audit.json في كل حالة يربط الأسعار بملفات raw-*.json ومعرّفات الباقات؛ result.json يحفظ نتيجة المحرك. workbook-checksums.json يحفظ بصمات ملفات Excel. ملف http-occupancy-tests.json يحفظ اختبارات API الواجهة. الصور توثق عرض المصدر وعرض الموقع.

الأسعار لقطة حية وقت الاستعلام وليست ضمانًا لاستمرار السعر أو التوفر. هذه أسعار حجوزات ليلة واحدة مستقلة؛ مجموعها قد يختلف عن حجز متصل 31 ليلة. فحص كل يوم اعتمد على رد API الرسمي؛ تمت أيضًا مقارنة صفحة المطار بصريًا كعينة (230 ر.س لغرفتين = 115 ر.س للغرفة بتاريخ 1 أكتوبر). لم تكتمل قراءة أسعار صفحة المسافر بصريًا داخل المتصفح، لذلك إثبات المسافر هنا هو ردود المصدر النهائية المحفوظة. النتيجة تثبت صحة الاستخراج والتصدير في النطاق المختبر، وليست اعتمادًا عامًا لكل فنادق وتواريخ الموقع.

## إعادة الفحص

من مجلد المشروع: node backend/verify-october-matrix.js --reconcile-only يعيد مطابقة الأدلة المحفوظة وتصدير الملفات؛ بدون هذا الخيار يجمع أسعارًا حية جديدة. --resume يستكمل الحالات الناقصة ويعيد مراجعة الموجود. النتائج الجديدة قد تختلف.
`;
await fs.writeFile(path.join(dir,'ACCEPTANCE.md'),text);
await fs.writeFile(path.join(dir,'workbook-checksums.json'),JSON.stringify({generatedAt:new Date().toISOString(),defaultWorkbooks:18,additionalRoomWorkbooks:workbooks,files:entries},null,2));
console.log(JSON.stringify({cases:18,days:558,available:report.availableDates,unavailable:report.unavailableDates,rawMatches:report.rawOfferMatches,defaultWorkbooks:18,roomWorkbooks:workbooks,httpCases:6}));
