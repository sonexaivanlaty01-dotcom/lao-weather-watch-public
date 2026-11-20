# ภาพดาวเทียมสีสำหรับผู้ใช้จำนวนมาก แบบฟรี

แนวคิด: **แยก "เครื่องแปลงภาพ" ออกจาก "ที่แจกภาพ"**

- **ที่แจกภาพ:** Cloudflare Workers แบบไฟล์ static อย่างเดียว ไม่มีโค้ดรัน
  เอกสาร Cloudflare ระบุว่าคำขอไฟล์ static ฟรีและไม่จำกัดจำนวน แม้ใช้แผนฟรี
  ผู้ใช้กี่คนก็ได้ ไม่ต้องมีโดเมน ใช้ที่อยู่ `*.workers.dev` ได้เลย
- **เครื่องแปลงภาพ:** `converter/convert.mjs` รันได้ทุกที่ที่มี Node 20+
  แปลงภาพ AWS Himawari-9 Band 13 แต่ละภาพครั้งเดียว เป็นภาพสีแบบ NASA
  ค่า °C จริง เก็บย้อนหลัง 5 ชั่วโมง (31 ภาพ) แล้ว deploy ขึ้น Cloudflare

ทดสอบกับข้อมูลจริง (ภาพ 01:20 น. วันที่ 9 ต.ค. 2026): ถอดและแปลงภาพ 2.7 วินาที ไฟล์ PNG 373 KB

## ทาง A — GitHub Actions + ตัวปลุกบน Cloudflare (แนะนำ ฟรีทั้งหมด)

0. ย้ายไฟล์ `converter/himawari.yml` ไปไว้ที่ `.github/workflows/himawari.yml` (ผมเขียนโฟลเดอร์ .github ในเครื่องคุณให้ไม่ได้)
1. สร้าง repository บน GitHub แบบ **public** (นาที Actions ไม่จำกัดสำหรับ public;
   แบบ private ได้ 2,000 นาที/เดือน ซึ่งไม่พอสำหรับรันทุก 10 นาที) แล้ว push โปรเจกต์นี้ขึ้นไป
   ไฟล์ลับ (API key) ห้ามอยู่ใน repo
2. Cloudflare Dashboard → My Profile → API Tokens → สร้าง token แบบ "Edit Cloudflare Workers"
3. ใน GitHub repo → Settings → Secrets and variables → Actions
   - Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
   - Variables: `HIMAWARI_CDN_BASE` = `https://lao-himawari.<subdomain>.workers.dev`
     (ครั้งแรกเว้นว่างได้ รู้ที่อยู่หลัง deploy ครั้งแรก)
4. กด Run workflow `himawari-frames` ครั้งแรกเอง ระบบจะแปลง 31 ภาพย้อนหลัง (~2–3 นาที) แล้ว deploy
5. ตัวปลุกให้ตรงเวลา (ฟรี): ใน `cloudflare/trigger/wrangler.toml` ใส่ชื่อ repo แล้ว
   `cd cloudflare/trigger` → `npx wrangler secret put GITHUB_TOKEN` → `npx wrangler deploy`
   (GitHub token แบบ fine-grained เฉพาะ repo นี้ สิทธิ์ Actions: Read and write)
   ถ้าไม่ทำขั้นนี้ ระบบยังทำงานด้วย schedule ของ GitHub แต่ GitHub อาจเริ่มช้า 5–15 นาที
6. ใส่ที่อยู่ใน `dist/aws-satellite.js` → `CLOUD_CDN_BASE` แล้ว build/deploy เว็บตามปกติ

ข้อควรรู้: เงื่อนไข GitHub Actions ห้ามใช้เป็น "CDN หรือส่วนหนึ่งของ serverless application"
และห้ามสร้างภาระเกินประโยชน์ งานนี้รันสั้นๆ (~1–2 นาที ทุก 10 นาที) เพื่อสร้างและเผยแพร่ไฟล์ของโปรเจกต์
และไม่ได้แจกไฟล์จาก GitHub แต่ GitHub เป็นผู้ตีความเงื่อนไขเอง จึงมีความเสี่ยงอยู่

## ทาง B — คอมพิวเตอร์ Windows ของคุณเป็นเครื่องแปลง

ตั้ง environment variables `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `HIMAWARI_CDN_BASE`
แล้วให้ Task Scheduler รัน `converter\run-once.cmd` ทุก 10 นาที เริ่มที่นาที :02
ฟรีและไม่ติดเงื่อนไขใคร แต่เครื่องต้องเปิดและต่อเน็ตตลอด ใช้เป็นตัวสำรองหรือช่วงทดลองได้
อย่ารันทาง A และ B พร้อมกัน เพราะต่างคน deploy ทับกัน

## ทางอื่นที่ใช้โค้ดเดียวกัน

Oracle Cloud VM ฟรี, Google Cloud Run Jobs + Cloud Scheduler (โควตาฟรี ต้องผูกบัตร)
หรือ Cloudflare Workers แบบเสียเงิน (`cloudflare/` เดิม) — เปลี่ยนแค่ที่รัน `convert.mjs`

## ตรวจ

`node verify-converter.mjs` และ `node verify-trigger.mjs`
