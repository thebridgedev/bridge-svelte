# Social sign-in

People can sign up and sign in with Google, Microsoft, Apple, GitHub, LinkedIn or Facebook. You switch each provider on in Bridge with your app's own keys from that provider. The sign-in and sign-up forms (`SignInForm`, `SignUpForm`, and Bridge's hosted page) then show a button for each provider that is on. You write no code for it.

Setting up a provider takes four steps, the same for every provider:

1. Make an app (a "client") in the provider's developer console.
2. Register the **return address** Bridge shows you. It is different for each of your apps and each provider: `https://<bridge>/v2/identity-access/apps/<your app id>/federated/<provider>/return`.
3. Enter the provider's details in Bridge: in the dashboard (Authentication › Login › the provider's card), with the CLI, or through your assistant.
4. Click **Test** in the provider's panel. Bridge does one sign-in with the provider and shows what came back. Nobody is signed in and no account is made. Then switch the provider on.

```bash
# The CLI prints the return address to register.
bridge auth providers set google --client-id <id> --client-secret <secret> --enable
bridge auth providers list
```

With an assistant, the Bridge MCP tool `setup_social_provider` does the same and answers the return address.

## Who gets in, and which account

- **A known person** signs in to their own account. Bridge finds them by the provider's id for them, never by email address alone.
- **A new person** gets an account and their own workspace when your app takes sign-ups. On the login form, a person with no account is offered "Create an account with Google" (or the provider they used).
- **The same email as an existing account** is linked only when the provider proves that address (Google, Apple, GitHub with a verified address, Microsoft inside your own directory). If the provider does not prove it, Bridge never links by email. The person signs in the way they already do, once, and then the provider is added to their account.
- **An address the provider does not prove** (Facebook always; Microsoft for personal accounts and other companies' accounts) is confirmed with Bridge's own email link before an account is made. The person sees "Check your email" and finishes in the same browser.

## Google

1. In Google Cloud Console › APIs & Services › Credentials: **Create credentials › OAuth client ID**, application type **Web application**.
2. **Authorized redirect URIs**: the return address Bridge shows for Google.
3. Copy the **Client ID** and **Client secret** into Bridge.
4. If the consent screen is in Testing, only test users can sign in: publish it before you go live.

## Microsoft

Microsoft is the hardest provider to set up. Follow these steps exactly.

**1. Choose who can sign in** (in Bridge, Microsoft panel):

| Choice | Who can sign in | Microsoft account type to pick in step 2 |
|---|---|---|
| Any Microsoft account (default) | Work, school and personal accounts | Accounts in any organizational directory and personal Microsoft accounts |
| Work or school accounts only | Any company's or school's accounts | Accounts in any organizational directory (multitenant) |
| Personal accounts only | Outlook.com, Hotmail, Xbox and other personal accounts | Personal Microsoft accounts only |
| One company's directory | Only your own company's people (give its directory ID or domain) | Accounts in this organizational directory only (single tenant) |

Use "one company's directory" for your own company only. To let each of your customers sign in with their own company's directory, use company login instead.

**2. Register the app** in the Microsoft Entra admin center (entra.microsoft.com) › App registrations › **New registration**:
- Name: your app's name, as people will see it on Microsoft's consent page.
- Supported account types: the one in the table above.
- Redirect URI: platform **Web**, the return address Bridge shows for Microsoft, copied exactly.

**3. Copy the Application (client) ID** from the Overview page into Bridge's Client ID.

**4. Make a secret**: Certificates & secrets › **New client secret**, expires in 24 months. Copy its **Value** (not the Secret ID) into Bridge's Client Secret right away: Microsoft shows it only once. Bridge keeps the expiry date (24 months from saving, or the date you enter) and warns in the panel from 30 days before it ends.

**5. Permissions**: keep the default `User.Read`. Bridge asks for `openid email profile`; nothing else is needed.

**6. Test, then switch Microsoft on.** Test once with a work account and once with a personal account if your choice allows both. The Test shows the account type and directory Microsoft returned.

**When it fails**, Bridge names the cause on the sign-in page and in the Test:

| Microsoft code | What Bridge says | What to do |
|---|---|---|
| AADSTS7000222, AADSTS7000215 | The client secret has expired or is wrong | Make a new secret (step 4) and save it in Bridge |
| AADSTS50011 | The return address is not registered | Add the exact return address as a **Web** redirect URI |
| AADSTS50194, AADSTS50020 | The registration does not accept this kind of account | Change Supported account types to match "who can sign in" |
| AADSTS700016 | The app is not in this directory | Check the Client ID, and that the registration is multitenant if other companies sign in |
| AADSTS65001, AADSTS90094 | An IT admin must approve the app | The person's IT admin approves it under Enterprise applications › your app › Permissions › Grant admin consent |

A person refused by "who can sign in" (for example a personal account when only work accounts may) sees a plain message saying which accounts the app accepts.

## Apple

Sign in with Apple needs a paid Apple Developer account. Apple does not accept `localhost` return addresses, so test it on stage or production.

1. **App ID**: in Certificates, Identifiers & Profiles › Identifiers, make sure your App ID has **Sign in with Apple** switched on.
2. **Services ID**: Identifiers › **+** › Services IDs. Its identifier (such as `com.example.signin`) is what Bridge calls the Services ID. Switch on Sign in with Apple › Configure: primary App ID your App ID; **Domains and Subdomains** the domain Bridge shows; **Return URLs** the return address Bridge shows for Apple.
3. **Key**: Keys › **+**, switch on Sign in with Apple, configure it with your App ID, and download the `.p8` file. Apple lets you download it **once**: keep it safe. Note its **Key ID**.
4. **Team ID**: under Membership details.
5. **Email relay**: people can choose "Hide My Email". Apple then gives Bridge a private relay address (`…@privaterelay.appleid.com`), and only forwards mail from senders you registered. Under Services › **Sign in with Apple for Email Communication**, register the sender address of your app's emails (shown in Bridge's Apple panel). Without it, invites and sign-in links never reach people who hide their email.
6. **Enter it in Bridge**: Services ID, Team ID, Key ID, and upload the `.p8` file. Bridge keeps the key sealed, never shows it again, and signs a short-lived client secret with it for each sign-in (Apple has no fixed secret).

```bash
bridge auth providers set apple --client-id com.example.signin --team-id A1B2C3D4E5 \
  --key-id F6G7H8I9J0 --private-key-file ./AuthKey_F6G7H8I9J0.p8 --enable
```

What people see:
- Apple asks the first time whether to share their name and email, or hide the email. Bridge keeps the name from that first sign-in; Apple does not send it again.
- Someone who hides their email gets an account with the relay address and is recognised every time by Apple's id for them. Their workspace is named from their first name, never from the relay address.
- Someone who shares the same email as an existing account is signed in to it, because Apple proves the address. Someone who hides it gets a separate account, because Apple gives a different address. This is normal with Apple.

Troubleshooting: `invalid_client` means the Services ID, Team ID or Key ID does not match the key, or the key is not enabled for Sign in with Apple. A return address mismatch means the Return URL on the Services ID is not exactly the one Bridge shows. No name on a later try: the person removes your app at appleid.apple.com (Sign-In & Security › Sign in with Apple) and signs in again.

## GitHub, LinkedIn, Facebook

- **GitHub**: Settings › Developer settings › OAuth Apps › New OAuth App; Authorization callback URL = the return address. GitHub gives Bridge the person's verified main email even when they keep it private.
- **LinkedIn**: developer portal › your app › Auth; add the return address under Authorized redirect URLs, and add the product "Sign In with LinkedIn using OpenID Connect".
- **Facebook**: Meta for Developers › your app › Facebook Login › Settings; Valid OAuth Redirect URIs = the return address. Facebook does not prove email addresses, so new people confirm theirs with Bridge's email link.

## Switching off

Switching a provider off removes its button from every form at once. Its keys stay saved, so switching it on again needs nothing new.
