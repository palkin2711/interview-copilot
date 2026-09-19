# My Interview Copilot

A mobile-first installable PWA that listens for interview questions, waits for a pause, and generates short English speaking cues grounded in the candidate's saved profile and job description.

## What this version includes

- Android Chrome continuous speech recognition
- Automatic restart when browser recognition ends
- Silence-based question completion detection
- Automatic interview-question filtering
- Resume/profile and job-description grounding
- Gemini answers through a server-side Vercel function
- Locally saved profile data
- PWA installation and offline app shell
- Manual question entry for testing and corrections
- Phone listener and laptop display modes with a shared private room code

## Important limitations

- The user must press **Start listening** once and grant microphone permission.
- Keep the phone unlocked, the app visible, and the laptop on speaker.
- Chrome's free Web Speech API can stop or mishear audio; the app retries automatically.
- PDF/DOCX parsing is not included in this dependency-free MVP. Paste the resume text or upload a `.txt` file.
- Generated cues may be wrong. Review them and never claim experience that is not yours.
- Obtain consent and follow the interviewer's or platform's AI-assistance policy.

## Deploy to Vercel

1. Create a GitHub repository and upload this entire folder.
2. In Vercel, select **Add New → Project** and import that repository.
3. Keep the default Framework Preset as **Other**.
4. In **Environment Variables**, add:
   - `GEMINI_API_KEY` — from Google AI Studio.
   - `GEMINI_MODEL` — optional; defaults to `gemini-3.6-flash`.
5. Deploy.
6. Open the HTTPS deployment URL in Android Chrome.
7. Use Chrome menu → **Add to Home screen**.

## Enable phone + laptop live sync

Connect a free Upstash Redis integration to the Vercel project. It should add either
`UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`, or
`KV_REST_API_URL` and `KV_REST_API_TOKEN`. Redeploy after connecting it.

On the phone select **Phone — listen & answer**. On the laptop select
**Laptop — display answers**. Enter the same private room code on both devices.

## Local checks

```bash
npm run check
npm test
```

For complete local API testing, install the Vercel CLI and run `vercel dev` with a `.env.local` file.

## Privacy model

The candidate profile and job description are stored in the device's `localStorage`. The browser handles speech recognition. Only a completed detected question, the saved profile/job context, and up to four recent question-answer pairs are sent to the Vercel function for Gemini generation.
