# BSC Textiles HRMS Mobile Application (Android & iOS)

A React Native & Expo mobile client for the BSC Textiles HRMS platform, connecting to the backend API (`http://localhost:4000/api` or LAN/Cloud).

---

## 🚀 Features

### 👤 Employee Self-Service (ESS)
- **Biometric Geofenced Punching**: Instant Check-In/Check-Out with GPS radius verification at showroom hubs.
- **Leave Management**: Real-time Casual, Sick, Earned, and LOP leave quota tracking with instant application submission.
- **Form T Payslips**: Monthly salary statements with gross earnings, statutory deductions, net payable, and encrypted PDF downloads.
- **Ex-Employee Dossier & F&F**: Exit clearance tracking, transparent settlement formulas, and bank payment confirmation.
- **KYC & Dossier**: DigiLocker verified profile with department, shift schedule, emergency kin, and banking details.

### 🛡️ Manager & HR Features
- **Supervisor Action Center**: Quick badge indicator for pending approvals.
- **Leave Request Approvals**: One-tap approve and reject with mandatory documented policy reasons.
- **Location Staff Directory**: Roster visibility across BSC Textiles Karnataka flagship stores and mills.

---

## 🛠️ Setup & Running Instructions

### 1. Prerequisites
- Node.js >= 20.0.0
- Expo CLI: `npm install -g expo-cli`
- Android Studio (for Android Emulator) or Xcode (for iOS Simulator on macOS)
- Or the **Expo Go** app installed on your physical Android or iPhone device.

### 2. Environment Configuration
Create a `.env` file in the `mobile/` directory or export `EXPO_PUBLIC_API_URL`:

```env
# For Android Emulator:
EXPO_PUBLIC_API_URL=http://10.0.2.2:4000/api

# For iOS Simulator:
EXPO_PUBLIC_API_URL=http://localhost:4000/api

# For Physical Device (on same Wi-Fi LAN):
EXPO_PUBLIC_API_URL=http://192.168.1.xxx:4000/api
```

### 3. Launch Development Server
```bash
# Navigate to mobile directory
cd mobile

# Start Expo bundler
npm run start
```

- Press `a` to launch on connected Android Emulator.
- Press `i` to launch on iOS Simulator.
- Scan the displayed QR code with the **Expo Go** app on your phone.

---

## 📦 Production Builds (EAS Build)

To generate signed APK/AAB for Android or IPA for iOS:

```bash
# Install EAS CLI
npm install -g eas-cli

# Login to Expo
eas login

# Configure project
eas build:configure

# Build Android APK for testing
eas build -p android --profile preview

# Build iOS Archive
eas build -p ios --profile preview
```
