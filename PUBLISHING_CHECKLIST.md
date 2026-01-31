# Meet Slide Capture - Chrome Web Store Publishing Checklist

## ✅ Pre-Publishing Checklist

### Code Quality

- [x] All console.log statements removed
- [x] Error handling implemented without logging
- [x] Production-ready code

### Features Complete

- [x] Auto-capture Google Meet presentation slides
- [x] Start/Stop controls with green badge indicator
- [x] Manual capture button
- [x] Settings page for detection parameters
- [x] Gallery view with all captured slides
- [x] Individual download/delete per slide
- [x] Export all as ZIP file
- [x] Export all as PDF
- [x] IndexedDB storage (unlimited)
- [x] Uninstall feedback form URL configured

### Extension Files

- [x] manifest.json (v3) properly configured
- [x] Icons in icons/ folder
- [x] All permissions justified and minimal
- [x] Content Security Policy compliant
- [x] JSZip bundled locally (no external CDN)

## 📦 What to Submit to Chrome Web Store

### Required Files

Upload these files/folders in a ZIP:

```
manifest.json
background.js
content.js
popup.html
popup.js
gallery.html
gallery.js
options.html
options.js
styles.css
db.js
jszip.min.js
icons/
```

**Do NOT include:**

- README.txt
- FEEDBACK_FORM_SETUP.md
- PUBLISHING_CHECKLIST.md
- .git folder (if present)
- node_modules (if present)

### Store Listing Information

**Name:** Meet Slide Capture

**Short Description (132 chars max):**
Automatically captures presentation slides during Google Meet screen sharing. View, download, and export captured slides.

**Detailed Description:**

```
Meet Slide Capture automatically detects and captures presentation slides shared during Google Meet calls. Perfect for students, educators, and professionals who want to keep a record of presented materials.

KEY FEATURES:
• Automatic Slide Detection - Intelligently captures slides when content changes
• Smart Duplicate Prevention - Avoids saving identical slides
• Gallery View - Browse all captured slides in one place
• Export Options - Download all slides as ZIP or PDF
• Manual Capture - Take screenshots on demand
• Privacy First - All captures stored locally in your browser
• Green Badge Indicator - Shows when capture is active

HOW TO USE:
1. Open a Google Meet call with screen sharing
2. Click the extension icon
3. Click "Start Capture"
4. The extension will automatically capture slide changes
5. Click "Stop Capture" when done
6. View captures in the Gallery
7. Export as ZIP or PDF, or download individual slides

PRIVACY & STORAGE:
• All captures are stored locally in your browser using IndexedDB
• No data is sent to external servers
• Captures remain private and accessible only to you
• Works entirely offline after initial installation

SETTINGS:
Customize detection sensitivity, capture interval, and other parameters in the Settings page to match your needs.

Perfect for:
- Students attending online lectures
- Professionals in virtual meetings
- Educators recording teaching materials
- Anyone who needs to capture presentation slides
```

**Category:** Productivity

**Language:** English

**Screenshots Required:** 5-10 screenshots showing:

1. Extension popup (Start/Stop controls)
2. Active capture with green badge
3. Gallery view with captured slides
4. Settings page
5. ZIP download in action
6. Individual slide download
7. Meet call with extension working

**Icon Sizes Required:**

- 128x128 (main icon)
- 48x48
- 16x16

**Privacy Policy Required:** Yes - create a simple page stating:

```
Meet Slide Capture Privacy Policy

Data Collection:
This extension does not collect, transmit, or store any personal information on external servers.

Data Storage:
All captured screenshots are stored locally in your browser using IndexedDB. No data is sent to external servers.

Permissions:
- Storage: To save captured slides locally
- Active Tab: To detect and capture slides during Google Meet calls
- Scripting: To inject capture functionality into Google Meet pages

Data Deletion:
You can delete all captures at any time using the "Clear All" button in the Gallery. Uninstalling the extension removes all stored data.

Contact:
[Your email or contact form]

Last Updated: [Date]
```

Host this on a simple webpage (GitHub Pages, your website, etc.)

## 🔧 Before Submitting

### 1. Setup Uninstall Feedback Form

- Follow instructions in `FEEDBACK_FORM_SETUP.md`
- Create Google Form
- Update URL in `background.js` line 15

### 2. Test Everything

- [ ] Install extension in Chrome
- [ ] Test on real Google Meet call
- [ ] Verify all buttons work
- [ ] Test ZIP download
- [ ] Test PDF export
- [ ] Test clear gallery
- [ ] Check badge indicator appears
- [ ] Verify no console errors (F12)

### 3. Create ZIP for Upload

```powershell
# In PowerShell:
Compress-Archive -Path manifest.json,background.js,content.js,popup.html,popup.js,gallery.html,gallery.js,options.html,options.js,styles.css,db.js,jszip.min.js,icons -DestinationPath meet_slide_capture.zip
```

### 4. Chrome Web Store Developer Account

- Create account at [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
- One-time registration fee: $5
- Verify your email

### 5. Submit Extension

1. Go to Developer Dashboard
2. Click "New Item"
3. Upload ZIP file
4. Fill in store listing information
5. Upload screenshots
6. Add privacy policy URL
7. Submit for review

### 6. Review Process

- Typically takes 1-7 days
- Check email for review status
- Address any feedback from reviewers

## 📝 Version History

**v1.5.0 (Current)**

- Removed all debug logging
- Added uninstall feedback form
- Production-ready release

## 🆘 Support

If you need help:

- Review Chrome Web Store [Developer Program Policies](https://developer.chrome.com/docs/webstore/program-policies/)
- Check [Extension Quality Guidelines](https://developer.chrome.com/docs/webstore/quality_guidelines/)
- Join Chrome Extension Developer community

## 🎉 After Publishing

Once approved:

- Extension will be live on Chrome Web Store
- Users can search and install it
- Monitor reviews and ratings
- Update extension via Developer Dashboard
- Check uninstall feedback form responses regularly
