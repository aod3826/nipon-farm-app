# การตั้งค่า Firebase Security Rules

จากข้อผิดพลาด `Missing or insufficient permissions` ที่พบ พบว่าเกิดจากการตั้งค่าใน Firebase Security Rules บนโปรเจกต์ของคุณ (`nipon-farm`) ที่ใช้งานอยู่หมดอายุ หรือยังไม่ได้เปิดใช้อนุญาตให้กับคอลเล็กชันต่างๆ เช่น การแจ้งซ่อม, ข่าวสาร, หรือห้องแชท

เนื่องจากคุณกำหนดการตั้งค่าฐานข้อมูลเชื่อมโยงไปยังบัญชีของคุณเอง ระบบนี้จึงไม่สามารถส่งอัปเดตกฎ (Deploy Rules) ให้คุณแบบอัตโนมัติได้ (จึงพบข้อผิดพลาด `Access denied.`)

เพื่อให้แอประบบจัดการฟาร์มทำงานได้สมบูรณ์และใช้งานข้อมูลใหม่ๆ ได้ กรุณาก๊อปปี้โค้ดด้านล่างนี้ ไปใส่ใน **Firebase Console** ของโปรเจกต์คุณ

### วิธีอัปเดต:

1. เข้าระบบที่ **[Firebase Console](https://console.firebase.google.com/u/0/project/nipon-farm/firestore/rules)**
2. ไปที่เมนู **Firestore Database** แล้วคลิกที่แท็บ **Rules**
3. ลบเนื้อหาเดิมออกทั้งหมด และ **คัดลอกโค้ดด้านล่างนี้ไปวางแทนที่**
4. กดปุ่ม **Publish** ระบบจะอนุญาตให้แอปทำงานได้ทันที

```javascript
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    
    // ---------------------------------------------------------
    // HELPERS
    // ---------------------------------------------------------

    function isAuthenticated() {
      return request.auth != null;
    }

    // ฟังก์ชันตรวจสอบสิทธิ์ผู้ดูแลระบบ (Admin) โดยอ่านจาก DB
    function isAdmin() {
      return isAuthenticated() && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'ADMIN';
    }

    // ตรวจสอบว่าเป็นเจ้าของข้อมูลหรือไม่
    function isOwner(data) {
      return isAuthenticated() && data.userId == request.auth.uid;
    }

    function incoming() {
      return request.resource.data;
    }

    function existing() {
      return resource.data;
    }

    // ตรวจสอบความถูกต้องของ ID
    function isValidId(id) {
      return id is string && id.size() <= 128 && id.matches('^[a-zA-Z0-9_\\-]+$');
    }

    // ---------------------------------------------------------
    // VALIDATION HELPERS (ตรวจสอบโครงสร้างข้อมูล)
    // ---------------------------------------------------------

    function isValidSow(data) {
      return data.keys().hasAll(['userId', 'sowId', 'status', 'parity', 'createdAt', 'updatedAt'])
        && data.userId == request.auth.uid
        && data.sowId is string && data.sowId.size() <= 64
        && data.status in ['IDLE', 'MATED', 'PREGNANT', 'LACTATING', 'RECOVERY', 'CULLED']
        && data.parity is number
        && data.createdAt is number
        && data.updatedAt is number;
    }

    function isValidSowEvent(data) {
      return data.keys().hasAll(['userId', 'sowId', 'type', 'date', 'parity', 'createdAt'])
        && data.userId == request.auth.uid
        && data.sowId is string
        && data.type in ['BREED', 'ULTRASOUND', 'FARROW', 'WEAN', 'HEALTH', 'CULL', 'HEAT_RETURN']
        && data.date is string && data.date.matches('^\\d{4}-\\d{2}-\\d{2}$')
        && data.parity is number
        && data.createdAt is number;
    }

    function isValidTask(data) {
      return data.keys().hasAll(['userId', 'sowId', 'sowDisplayId', 'type', 'dueDate', 'status', 'createdAt'])
        && data.userId == request.auth.uid
        && data.sowId is string
        && data.sowDisplayId is string
        && data.type in ['HEAT_CHECK', 'ULTRASOUND', 'MOVE_TO_FARROW', 'FARROW', 'WEAN', 'BREED']
        && data.dueDate is string && data.dueDate.matches('^\\d{4}-\\d{2}-\\d{2}$')
        && data.status in ['PENDING', 'COMPLETED', 'CANCELLED']
        && data.createdAt is number;
    }

    function isValidMaintenanceRequest(data) {
      return data.keys().hasAll(['userId', 'title', 'description', 'location', 'status', 'urgency', 'reportedBy', 'createdAt'])
        && data.userId == request.auth.uid
        && data.title is string && data.title.size() <= 200
        && data.status in ['PENDING', 'IN_PROGRESS', 'RESOLVED']
        && data.urgency in ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
        && data.createdAt is number;
    }

    // ---------------------------------------------------------
    // RULES (กฎการเข้าถึง)
    // ---------------------------------------------------------

    // ปฏิเสธการเข้าถึงทั้งหมดไว้ก่อนเพื่อความปลอดภัย
    match /{document=**} {
      allow read, write: if false;
    }

    // ข้อมูลโปรไฟล์ผู้ใช้
    match /users/{userId} {
      allow read: if isAuthenticated();
      allow create: if isAuthenticated() && request.auth.uid == userId;
      allow update: if isAuthenticated() && (request.auth.uid == userId || isAdmin()) 
        && (!incoming().diff(existing()).affectedKeys().hasAny(['role']) || isAdmin());
    }

    // แม่หมู
    match /sows/{sowId} {
      allow read: if isAuthenticated();
      allow create: if isAuthenticated() && isValidSow(incoming()) && isValidId(sowId);
      allow update: if isAuthenticated() && (isAdmin() || (isOwner(existing()) && isValidSow(incoming())));
      allow delete: if isAdmin();
    }
    
    // กิจกรรมแม่หมู
    match /events/{eventId} {
      allow read: if isAuthenticated();
      allow create: if isAuthenticated() && isValidSowEvent(incoming()) && isValidId(eventId);
      allow update: if isAuthenticated() && (isAdmin() || (isOwner(existing()) && isValidSowEvent(incoming())));
      allow delete: if isAdmin();
    }
    
    // งานที่ต้องทำ
    match /tasks/{taskId} {
      allow read: if isAuthenticated();
      allow create: if isAuthenticated() && isValidTask(incoming()) && isValidId(taskId);
      allow update: if isAuthenticated() && (isAdmin() || (isOwner(existing()) && isValidTask(incoming())));
      allow delete: if isAdmin();
    }

    // การขายหมู
    match /pig_sales/{saleId} {
      allow read: if isAuthenticated();
      allow create: if isAuthenticated() && incoming().userId == request.auth.uid && isValidId(saleId);
      allow update: if isAuthenticated() && (isAdmin() || isOwner(existing()));
      allow delete: if isAdmin();
    }

    // การแจ้งซ่อม
    match /maintenance_requests/{requestId} {
      allow read: if isAuthenticated();
      allow create: if isAuthenticated() && isValidMaintenanceRequest(incoming()) && isValidId(requestId);
      allow update: if isAuthenticated() && (isAdmin() || isOwner(existing()));
      allow delete: if isAdmin();
    }

    // ข่าวสาร
    match /news_posts/{postId} {
      allow read: if isAuthenticated();
      allow create: if isAuthenticated() && incoming().userId == request.auth.uid && isValidId(postId);
      allow update: if isAuthenticated() && (isAdmin() || isOwner(existing()));
      allow delete: if isAdmin() || isOwner(existing());
    }

    // ห้องแชท
    match /chat_rooms/{roomId} {
      allow read: if isAuthenticated() && request.auth.uid in existing().participants;
      allow create: if isAuthenticated() && request.auth.uid in incoming().participants;
      allow update: if isAuthenticated() && request.auth.uid in existing().participants;
      allow delete: if isAdmin();
    }
    
    // ข้อความแชท
    match /chat_messages/{messageId} {
      allow read: if isAuthenticated(); 
      allow create: if isAuthenticated() && incoming().senderId == request.auth.uid;
      allow update: if isAuthenticated() && incoming().senderId == request.auth.uid;
      allow delete: if isAdmin();
    }
    
    // ระบบพนักงานและเงินเดือน (Admin Only)
    match /employee_transactions/{documentId} {
      allow read, write: if isAdmin();
    }

    match /employee_salaries/{documentId} {
      allow read, write: if isAdmin();
    }
  }
}

```

*นอกจากนี้ ได้ทำการแก้ไขข้อผิดพลาดในโค้ดฝั่งแอปพลิเคชัน (Catch Unhandled Errors) เมื่อมีปัญหาด้าน Permissions จะไม่ทำให้หน้าจอดับหรือแอปหยุดทำงาน (Crash) อย่างเช่น `INTERNAL ASSERTION FAILED` อีกต่อไป*
