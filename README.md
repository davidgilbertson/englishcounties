# English counties

A little game to teach the English Counties.

## Deployment

- Pushes to `main` trigger `.github/workflows/firebase-hosting-merge.yml`, which builds the Vite app and deploys the `dist` folder to the `englishcounties` Firebase Hosting site.
- Pull requests trigger `.github/workflows/firebase-hosting-pull-request.yml`, which deploys the branch to a preview channel (Firebase comments back with the special URL).
- Both workflows require a GitHub secret named `FIREBASE_SERVICE_ACCOUNT_ENGLISHCOUNTIES` that contains the JSON for a Firebase service account with Hosting Admin permissions. You can create it in Firebase Console → Project settings → Service accounts → Generate new private key, then paste the entire JSON blob into the GitHub secret.
