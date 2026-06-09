// firebase-config.js
// Replace these placeholders with your actual Firebase project settings.
// You can get these details from the Firebase Console (Settings > Project Settings).
export const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  databaseURL: "YOUR_DATABASE_URL",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Application Custom Configurations
export const APP_CONFIG = {
  // Secret passcode to gain entry to the chat (Only numeric passcode matches standard pin entry screens, but can be text too)
  PASSCODE: "1402",
  
  // Relationship Start Date (Format: YYYY-MM-DD)
  // Used to count "Together for X days ❤️"
  RELATIONSHIP_START_DATE: "2024-02-14"
};
