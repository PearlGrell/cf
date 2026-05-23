import { google } from 'googleapis';
import fs from 'fs/promises';
import readline from 'readline';
import { settings } from '../src/config/settings.js';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => {
  return new Promise((resolve) => rl.question(query, resolve));
};

async function main() {
  console.log('\n\x1b[35m%s\x1b[0m', '=======================================================');
  console.log('\x1b[35m%s\x1b[0m', '  Google Tasks OAuth Authorization Bootstrap Helper   ');
  console.log('\x1b[35m%s\x1b[0m', '=======================================================\n');

  const credPath = settings.GOOGLE_CREDENTIALS_PATH;
  try {
    try {
      await fs.access(credPath);
    } catch {
      console.error('\x1b[31m%s\x1b[0m', `ERROR: Credentials file not found at: ${credPath}`);
      console.log('Please download your client secrets credentials.json from Google Cloud Console');
      console.log('and place it under the data/ directory, then try again.\n');
      rl.close();
      process.exit(1);
    }

    const fileContent = await fs.readFile(credPath, 'utf-8');
    const creds = JSON.parse(fileContent);
    const clientInfo = creds.installed || creds.web;
    
    if (!clientInfo) {
      throw new Error('credentials.json is malformed. Ensure it contains an "installed" or "web" block.');
    }

    const { client_secret, client_id, redirect_uris } = clientInfo;
    const oauth2Client = new google.auth.OAuth2(
      client_id,
      client_secret,
      redirect_uris ? redirect_uris[0] : 'http://localhost'
    );

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: [
        'https://www.googleapis.com/auth/tasks',
        'https://www.googleapis.com/auth/calendar.events'
      ]
    });

    console.log('STEP 1: Open the link below in your web browser to authenticate:');
    console.log('\x1b[36m%s\x1b[0m\n', authUrl);

    console.log('STEP 2: Consent and authorize the requested scope.');
    console.log('STEP 3: After authorization, you will be redirected to localhost (which may display a blank/error page).');
    console.log('        Look at your browser address bar and copy the "code" query parameter value.');
    console.log('        (Example: http://localhost/?code=4/0Af...)\n');

    const authCodeInput = await question('Enter the authorization code or the complete redirect URL: ');
    rl.close();

    let authCode = authCodeInput ? authCodeInput.trim() : '';
    
    // Automatically parse and extract 'code' if the user pasted the complete redirect URL
    if (authCode.startsWith('http://') || authCode.startsWith('https://')) {
      try {
        const urlObj = new URL(authCode);
        const codeParam = urlObj.searchParams.get('code');
        if (codeParam) {
          authCode = codeParam;
          console.log('\x1b[32m%s\x1b[0m', `✓ Successfully extracted code parameter from the pasted URL: ${authCode.substring(0, 10)}...`);
        } else {
          console.log('\x1b[33m%s\x1b[0m', 'WARNING: Paste detected as URL but no "?code=" parameter was found. Attempting to use raw input.');
        }
      } catch (err) {
        console.log('\x1b[33m%s\x1b[0m', 'WARNING: Failed to parse pasted text as a URL. Attempting to use raw input.');
      }
    }

    if (!authCode || authCode === '') {
      throw new Error('Authorization code cannot be empty.');
    }

    console.log('\nExchanging code for secure credentials block...');
    const { tokens } = await oauth2Client.getToken(authCode);
    
    if (!tokens.refresh_token) {
      console.log('\x1b[33m%s\x1b[0m', 'WARNING: No refresh token returned. If you are re-authorizing, please delete');
      console.log('the app authorization from your Google Account settings and run this script again.');
    }

    await fs.mkdir('data', { recursive: true });
    await fs.writeFile(settings.GOOGLE_TOKEN_PATH, JSON.stringify(tokens, null, 2));
    
    console.log('\n\x1b[32m%s\x1b[0m', '✓ SUCCESS: Authorized Google Tasks API successfully!');
    console.log(`Tokens written to persistent disk at: "${settings.GOOGLE_TOKEN_PATH}"\n`);
    
    console.log('\x1b[33m%s\x1b[0m', '================================================================');
    console.log('\x1b[33m%s\x1b[0m', '  Vercel Serverless Stateless Deployment Variable               ');
    console.log('\x1b[33m%s\x1b[0m', '================================================================');
    console.log('If you are deploying statelessly to Vercel, copy the string below');
    console.log('and paste it as the environment variable: GOOGLE_OAUTH_TOKEN_JSON\n');
    console.log(JSON.stringify(tokens));
    console.log('\x1b[33m%s\x1b[0m', '================================================================\n');

  } catch (err) {
    console.error('\n\x1b[31m%s\x1b[0m', '✖ ERROR: Google Tasks authorization failed!');
    console.error(err instanceof Error ? err.message : String(err));
    rl.close();
    process.exit(1);
  }
}

main();
