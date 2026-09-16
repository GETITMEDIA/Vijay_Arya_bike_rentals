/* ==========================================================================
   Vijay Arya Bike Rentals — Firebase configuration
   --------------------------------------------------------------------------
   HOW TO FILL THIS FILE (one time, 5 minutes):

   1. Go to  https://console.firebase.google.com  →  "Add project"
      Name it: Vijay Arya Bike Rentals   (Google Analytics: not needed)

   2. Inside the project click the Web icon  </>  →  register an app
      App nickname: "Vijay Arya Website"   →  Register app

   3. Firebase shows a firebaseConfig block. Copy those 6 values here.

   4. In the left menu enable these three:
        • Build → Firestore Database → Create database → Start in production mode
        • Build → Storage          → Get started      → production mode
        • Build → Authentication   → Get started → Email/Password → Enable
          Then: Users tab → Add user → your admin email + password
          (that becomes the admin panel login)

   5. Paste the rules from firebase-rules.txt into
      Firestore → Rules   and   Storage → Rules   →  Publish

   Until this file is filled in, the site keeps working in offline demo mode
   (browser storage only).
   ========================================================================== */

window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyCdBuH8IXZpDmpEVW5E2q5oAoBAW4j2fs8",
  authDomain: "vijay-arya-bike-rentals-4e200.firebaseapp.com",
  projectId: "vijay-arya-bike-rentals-4e200",
  storageBucket: "vijay-arya-bike-rentals-4e200.firebasestorage.app",
  messagingSenderId: "544660907564",
  appId: "1:544660907564:web:19f90e84e173a96f3d5389"
};

// Set to false to force offline demo mode even when the config is filled in
window.FIREBASE_ENABLED = true;

// Firestore transport.
//   true  (default) = long-polling — plain XHR requests. Works behind
//                     antivirus software, proxies, VPNs and office firewalls
//                     that break Firestore's streaming connection
//                     (symptom: requests hang, then "unavailable").
//   false           = let the SDK auto-detect (marginally faster).
window.FIREBASE_FORCE_LONG_POLLING = true;
