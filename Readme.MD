# Autocapture – Smart Slide Capture for Google Meet

Autocapture is a Chrome extension that automatically captures presentation slides during Google Meet sessions and organizes them into smart workspaces.  
I built this because, as a student, I attend Google Meet classes almost every day and teachers usually don’t share slides. Taking screenshots manually breaks focus and gets messy really fast.

Autocapture handles that problem automatically and even helps you understand the content using OCR and AI.



## Why I Built This

Slides change quickly during online classes and meetings.  
Manually capturing them is:
- Distracting  
- Easy to forget  
- Hard to organize later  

I wanted a tool that could:
- Capture slides automatically
- Avoid duplicate screenshots
- Organize slides properly
- Help me revise and understand later  

That’s how Autocapture started.

## Features

### 📸 Slide Capture
- Automatic slide capture during Google Meet
- Smart detection to avoid duplicate slides
- Manual capture option (fallback, rarely needed)

### Advanced Settings
- Customize capture interval
- Adjust capture speed
- Set minimum change percentage
- Configure debounce time and threshold values

### Gallery / Workspace Home
- View captured slides as thumbnails
- Slides stored locally in Chrome storage
- Sync slides to cloud workspace
- Download all slides
- Export slides as PDF
- Delete selected or all slides

### Workspaces
- Create multiple workspaces
- Rename existing workspaces
- Sync slides to selected workspaces
- Organize slides by class, meeting, or topic

### OCR & AI Features
- Extract text from slides using OCR (OCR.space)
- Ask AI questions based on slide content
- Automatically summarize slides
- Get explanations and insights from captured content



## Tech Stack

- Chrome Extension (Manifest V3)
- JavaScript / TypeScript
- Supabase (storage + database)
- OCR.space API (text extraction)
- AI APIs (summarization & Q&A)
- Chrome Local Storage



## Privacy & Storage

- Slides are first stored locally in the browser
- Cloud sync happens only when the user chooses
- No unnecessary data collection



## Challenges Faced

- First time building a Chrome extension
- Duplicate slide captures due to zoom or animations
- Tuning debounce time, threshold, and capture intervals
- Chrome Content Security Policy (CSP) errors with external links
- Integrating OCR without proper tutorials
- Switching from Cloudinary to Supabase due to familiarity
- Avoiding paid features early to allow free testing

Each challenge helped me learn how real-world systems actually work.



## How It Works

1. Join a Google Meet
2. Autocapture detects slide changes
3. Slides are captured automatically
4. Files appear in the gallery
5. Sync to a workspace
6. Use OCR, AI, or export options


## Use Cases

- Online classes and lectures
- Students and self-learners
- Team meetings
- Training sessions
- Interviews



## Future Improvements

- Better slide similarity detection
- More accurate capture logic
- Offline AI summaries
- Workspace sharing
- More AI tools for learning



## Final Note

This project started as a personal problem and turned into a full product.  
It helped me learn Chrome extensions, browser security, OCR, AI workflows, and product design.

If you find this useful, feel free to ⭐ the repo.
