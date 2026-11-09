/**
 * The plugin's own copy, for screens the shared catalogue in auth-core does
 * not cover yet. Same 12 languages and house style: informal address,
 * impersonal errors that end in a full stop, labels and buttons without one,
 * placeholders positioned in the sentence.
 */
export type PluginMessageKey =
	| 'signup.closed'
	| 'field.workspaceName'
	| 'verify.missingLink'
	| 'forgot.setDone'
	| 'invite.description'
	| 'invite.notOffered'
	| 'invite.signInToAccept'
	| 'handoff.invalid'
	| 'handoff.notOffered'
	| 'session.ended'
	| 'session.accessRemoved'
	| 'error.generic'
	| 'workspace.empty'
	| 'workspace.current'
	| 'password.tooShort'
	| 'feature.upgrade';

export type PluginMessages = Record<PluginMessageKey, string>;

const en: PluginMessages = {
	'signup.closed': 'Sign-up is closed for this app.',
	'field.workspaceName': 'Workspace name',
	'verify.missingLink': 'Open this page from the link in your email.',
	'forgot.setDone': 'Your password is set. Sign in with your new password.',
	'invite.description': 'You are invited to join {workspace}.',
	'invite.notOffered': 'Invites cannot be accepted here yet. Ask the person who invited you to try again later.',
	'invite.signInToAccept': 'Sign in or create an account to accept the invite.',
	'handoff.invalid': 'This sign-in link is not valid. Start signing in again from {program}.',
	'handoff.notOffered': 'This page does not sign in other programs.',
	'session.ended': 'Your session ended. Please sign in again.',
	'session.accessRemoved': 'Your access to that workspace changed. Please sign in again.',
	'error.generic': 'Something went wrong. Please try again.',
	'workspace.empty': 'You are not a member of any workspace yet.',
	'workspace.current': 'Current',
	'password.tooShort': 'Use at least {count} characters.',
	'feature.upgrade': 'Upgrade to use this',
};

const sv: PluginMessages = {
	'signup.closed': 'Registrering är stängd för den här appen.',
	'field.workspaceName': 'Arbetsytans namn',
	'verify.missingLink': 'Öppna den här sidan från länken i ditt mejl.',
	'forgot.setDone': 'Ditt lösenord är satt. Logga in med ditt nya lösenord.',
	'invite.description': 'Du är inbjuden till {workspace}.',
	'invite.notOffered': 'Inbjudningar kan inte tas emot här än. Be den som bjöd in dig att försöka igen senare.',
	'invite.signInToAccept': 'Logga in eller skapa ett konto för att ta emot inbjudan.',
	'handoff.invalid': 'Inloggningslänken är inte giltig. Börja logga in igen från {program}.',
	'handoff.notOffered': 'Den här sidan loggar inte in andra program.',
	'session.ended': 'Din session har avslutats. Logga in igen.',
	'session.accessRemoved': 'Din åtkomst till arbetsytan har ändrats. Logga in igen.',
	'error.generic': 'Något gick fel. Försök igen.',
	'workspace.empty': 'Du är inte medlem i någon arbetsyta än.',
	'workspace.current': 'Aktuell',
	'password.tooShort': 'Använd minst {count} tecken.',
	'feature.upgrade': 'Uppgradera för att använda detta',
};

const da: PluginMessages = {
	'signup.closed': 'Tilmelding er lukket for denne app.',
	'field.workspaceName': 'Arbejdsområdets navn',
	'verify.missingLink': 'Åbn denne side fra linket i din e-mail.',
	'forgot.setDone': 'Din adgangskode er sat. Log ind med din nye adgangskode.',
	'invite.description': 'Du er inviteret til {workspace}.',
	'invite.notOffered': 'Invitationer kan ikke modtages her endnu. Bed den, der inviterede dig, om at prøve igen senere.',
	'invite.signInToAccept': 'Log ind eller opret en konto for at tage imod invitationen.',
	'handoff.invalid': 'Login-linket er ikke gyldigt. Start login igen fra {program}.',
	'handoff.notOffered': 'Denne side logger ikke andre programmer ind.',
	'session.ended': 'Din session er afsluttet. Log ind igen.',
	'session.accessRemoved': 'Din adgang til arbejdsområdet er ændret. Log ind igen.',
	'error.generic': 'Noget gik galt. Prøv igen.',
	'workspace.empty': 'Du er ikke medlem af noget arbejdsområde endnu.',
	'workspace.current': 'Aktuel',
	'password.tooShort': 'Brug mindst {count} tegn.',
	'feature.upgrade': 'Opgrader for at bruge dette',
};

const nb: PluginMessages = {
	'signup.closed': 'Registrering er stengt for denne appen.',
	'field.workspaceName': 'Navn på arbeidsområdet',
	'verify.missingLink': 'Åpne denne siden fra lenken i e-posten din.',
	'forgot.setDone': 'Passordet ditt er satt. Logg inn med det nye passordet.',
	'invite.description': 'Du er invitert til {workspace}.',
	'invite.notOffered': 'Invitasjoner kan ikke tas imot her ennå. Be den som inviterte deg om å prøve igjen senere.',
	'invite.signInToAccept': 'Logg inn eller opprett en konto for å ta imot invitasjonen.',
	'handoff.invalid': 'Innloggingslenken er ikke gyldig. Start innloggingen på nytt fra {program}.',
	'handoff.notOffered': 'Denne siden logger ikke inn andre programmer.',
	'session.ended': 'Økten din er avsluttet. Logg inn på nytt.',
	'session.accessRemoved': 'Tilgangen din til arbeidsområdet er endret. Logg inn på nytt.',
	'error.generic': 'Noe gikk galt. Prøv igjen.',
	'workspace.empty': 'Du er ikke medlem av noe arbeidsområde ennå.',
	'workspace.current': 'Gjeldende',
	'password.tooShort': 'Bruk minst {count} tegn.',
	'feature.upgrade': 'Oppgrader for å bruke dette',
};

const nl: PluginMessages = {
	'signup.closed': 'Registreren is gesloten voor deze app.',
	'field.workspaceName': 'Naam van de werkruimte',
	'verify.missingLink': 'Open deze pagina via de link in je e-mail.',
	'forgot.setDone': 'Je wachtwoord is ingesteld. Log in met je nieuwe wachtwoord.',
	'invite.description': 'Je bent uitgenodigd voor {workspace}.',
	'invite.notOffered': 'Uitnodigingen kunnen hier nog niet worden aangenomen. Vraag degene die je uitnodigde het later opnieuw te proberen.',
	'invite.signInToAccept': 'Log in of maak een account aan om de uitnodiging aan te nemen.',
	'handoff.invalid': 'Deze inloglink is niet geldig. Begin opnieuw met inloggen vanuit {program}.',
	'handoff.notOffered': 'Deze pagina logt geen andere programma\'s in.',
	'session.ended': 'Je sessie is beëindigd. Log opnieuw in.',
	'session.accessRemoved': 'Je toegang tot die werkruimte is gewijzigd. Log opnieuw in.',
	'error.generic': 'Er ging iets mis. Probeer het opnieuw.',
	'workspace.empty': 'Je bent nog geen lid van een werkruimte.',
	'workspace.current': 'Huidig',
	'password.tooShort': 'Gebruik minstens {count} tekens.',
	'feature.upgrade': 'Upgrade om dit te gebruiken',
};

const de: PluginMessages = {
	'signup.closed': 'Die Registrierung ist für diese App geschlossen.',
	'field.workspaceName': 'Name des Arbeitsbereichs',
	'verify.missingLink': 'Öffne diese Seite über den Link in deiner E-Mail.',
	'forgot.setDone': 'Dein Passwort ist gesetzt. Melde dich mit deinem neuen Passwort an.',
	'invite.description': 'Du bist zu {workspace} eingeladen.',
	'invite.notOffered': 'Einladungen können hier noch nicht angenommen werden. Bitte die Person, die dich eingeladen hat, es später erneut zu versuchen.',
	'invite.signInToAccept': 'Melde dich an oder erstelle ein Konto, um die Einladung anzunehmen.',
	'handoff.invalid': 'Dieser Anmeldelink ist ungültig. Starte die Anmeldung erneut über {program}.',
	'handoff.notOffered': 'Diese Seite meldet keine anderen Programme an.',
	'session.ended': 'Deine Sitzung wurde beendet. Bitte melde dich erneut an.',
	'session.accessRemoved': 'Dein Zugriff auf diesen Arbeitsbereich hat sich geändert. Bitte melde dich erneut an.',
	'error.generic': 'Etwas ist schiefgelaufen. Bitte versuche es erneut.',
	'workspace.empty': 'Du bist noch in keinem Arbeitsbereich Mitglied.',
	'workspace.current': 'Aktuell',
	'password.tooShort': 'Verwende mindestens {count} Zeichen.',
	'feature.upgrade': 'Upgrade, um das zu nutzen',
};

const fi: PluginMessages = {
	'signup.closed': 'Rekisteröityminen on suljettu tässä sovelluksessa.',
	'field.workspaceName': 'Työtilan nimi',
	'verify.missingLink': 'Avaa tämä sivu sähköpostisi linkistä.',
	'forgot.setDone': 'Salasanasi on asetettu. Kirjaudu sisään uudella salasanallasi.',
	'invite.description': 'Sinut on kutsuttu työtilaan {workspace}.',
	'invite.notOffered': 'Kutsuja ei voi vielä hyväksyä täällä. Pyydä kutsujaa yrittämään myöhemmin uudelleen.',
	'invite.signInToAccept': 'Kirjaudu sisään tai luo tili hyväksyäksesi kutsun.',
	'handoff.invalid': 'Kirjautumislinkki ei ole voimassa. Aloita kirjautuminen uudelleen ohjelmasta {program}.',
	'handoff.notOffered': 'Tämä sivu ei kirjaa sisään muita ohjelmia.',
	'session.ended': 'Istuntosi päättyi. Kirjaudu sisään uudelleen.',
	'session.accessRemoved': 'Pääsysi työtilaan on muuttunut. Kirjaudu sisään uudelleen.',
	'error.generic': 'Jokin meni vikaan. Yritä uudelleen.',
	'workspace.empty': 'Et ole vielä minkään työtilan jäsen.',
	'workspace.current': 'Nykyinen',
	'password.tooShort': 'Käytä vähintään {count} merkkiä.',
	'feature.upgrade': 'Päivitä käyttääksesi tätä',
};

const fr: PluginMessages = {
	'signup.closed': 'Les inscriptions sont fermées pour cette application.',
	'field.workspaceName': 'Nom de l\'espace de travail',
	'verify.missingLink': 'Ouvre cette page depuis le lien de ton e-mail.',
	'forgot.setDone': 'Ton mot de passe est défini. Connecte-toi avec ton nouveau mot de passe.',
	'invite.description': 'Tu es invité à rejoindre {workspace}.',
	'invite.notOffered': 'Les invitations ne peuvent pas encore être acceptées ici. Demande à la personne qui t\'a invité de réessayer plus tard.',
	'invite.signInToAccept': 'Connecte-toi ou crée un compte pour accepter l\'invitation.',
	'handoff.invalid': 'Ce lien de connexion n\'est pas valide. Recommence la connexion depuis {program}.',
	'handoff.notOffered': 'Cette page ne connecte pas d\'autres programmes.',
	'session.ended': 'Ta session a pris fin. Connecte-toi à nouveau.',
	'session.accessRemoved': 'Ton accès à cet espace de travail a changé. Connecte-toi à nouveau.',
	'error.generic': 'Une erreur s\'est produite. Réessaie.',
	'workspace.empty': 'Tu n\'es encore membre d\'aucun espace de travail.',
	'workspace.current': 'Actuel',
	'password.tooShort': 'Utilise au moins {count} caractères.',
	'feature.upgrade': 'Passe à l\'offre supérieure pour l\'utiliser',
};

const es: PluginMessages = {
	'signup.closed': 'El registro está cerrado para esta aplicación.',
	'field.workspaceName': 'Nombre del espacio de trabajo',
	'verify.missingLink': 'Abre esta página desde el enlace de tu correo.',
	'forgot.setDone': 'Tu contraseña está lista. Inicia sesión con tu nueva contraseña.',
	'invite.description': 'Te han invitado a {workspace}.',
	'invite.notOffered': 'Aquí todavía no se pueden aceptar invitaciones. Pide a quien te invitó que lo intente más tarde.',
	'invite.signInToAccept': 'Inicia sesión o crea una cuenta para aceptar la invitación.',
	'handoff.invalid': 'Este enlace de inicio de sesión no es válido. Vuelve a iniciar sesión desde {program}.',
	'handoff.notOffered': 'Esta página no inicia sesión en otros programas.',
	'session.ended': 'Tu sesión ha terminado. Vuelve a iniciar sesión.',
	'session.accessRemoved': 'Tu acceso a ese espacio de trabajo ha cambiado. Vuelve a iniciar sesión.',
	'error.generic': 'Algo salió mal. Inténtalo de nuevo.',
	'workspace.empty': 'Todavía no eres miembro de ningún espacio de trabajo.',
	'workspace.current': 'Actual',
	'password.tooShort': 'Usa al menos {count} caracteres.',
	'feature.upgrade': 'Mejora tu plan para usar esto',
};

const it: PluginMessages = {
	'signup.closed': 'La registrazione è chiusa per questa app.',
	'field.workspaceName': 'Nome dello spazio di lavoro',
	'verify.missingLink': 'Apri questa pagina dal link nella tua email.',
	'forgot.setDone': 'La tua password è impostata. Accedi con la nuova password.',
	'invite.description': 'Sei stato invitato in {workspace}.',
	'invite.notOffered': 'Gli inviti non possono ancora essere accettati qui. Chiedi a chi ti ha invitato di riprovare più tardi.',
	'invite.signInToAccept': 'Accedi o crea un account per accettare l\'invito.',
	'handoff.invalid': 'Questo link di accesso non è valido. Ricomincia l\'accesso da {program}.',
	'handoff.notOffered': 'Questa pagina non fa accedere altri programmi.',
	'session.ended': 'La tua sessione è terminata. Accedi di nuovo.',
	'session.accessRemoved': 'Il tuo accesso a quello spazio di lavoro è cambiato. Accedi di nuovo.',
	'error.generic': 'Qualcosa è andato storto. Riprova.',
	'workspace.empty': 'Non sei ancora membro di nessuno spazio di lavoro.',
	'workspace.current': 'Attuale',
	'password.tooShort': 'Usa almeno {count} caratteri.',
	'feature.upgrade': 'Passa a un piano superiore per usarlo',
};

const pt: PluginMessages = {
	'signup.closed': 'O registo está fechado para esta aplicação.',
	'field.workspaceName': 'Nome do espaço de trabalho',
	'verify.missingLink': 'Abre esta página a partir do link no teu email.',
	'forgot.setDone': 'A tua palavra-passe está definida. Inicia sessão com a nova palavra-passe.',
	'invite.description': 'Foste convidado para {workspace}.',
	'invite.notOffered': 'Ainda não é possível aceitar convites aqui. Pede a quem te convidou para tentar mais tarde.',
	'invite.signInToAccept': 'Inicia sessão ou cria uma conta para aceitar o convite.',
	'handoff.invalid': 'Este link de início de sessão não é válido. Começa de novo a partir de {program}.',
	'handoff.notOffered': 'Esta página não inicia sessão noutros programas.',
	'session.ended': 'A tua sessão terminou. Inicia sessão novamente.',
	'session.accessRemoved': 'O teu acesso a esse espaço de trabalho mudou. Inicia sessão novamente.',
	'error.generic': 'Algo correu mal. Tenta novamente.',
	'workspace.empty': 'Ainda não és membro de nenhum espaço de trabalho.',
	'workspace.current': 'Atual',
	'password.tooShort': 'Usa pelo menos {count} caracteres.',
	'feature.upgrade': 'Faz upgrade para usar isto',
};

const pl: PluginMessages = {
	'signup.closed': 'Rejestracja w tej aplikacji jest zamknięta.',
	'field.workspaceName': 'Nazwa przestrzeni roboczej',
	'verify.missingLink': 'Otwórz tę stronę z linku w swoim e-mailu.',
	'forgot.setDone': 'Hasło zostało ustawione. Zaloguj się nowym hasłem.',
	'invite.description': 'Masz zaproszenie do {workspace}.',
	'invite.notOffered': 'Zaproszeń nie można jeszcze tu przyjąć. Poproś osobę, która cię zaprosiła, by spróbowała później.',
	'invite.signInToAccept': 'Zaloguj się lub załóż konto, by przyjąć zaproszenie.',
	'handoff.invalid': 'Ten link logowania jest nieprawidłowy. Zacznij logowanie od nowa w {program}.',
	'handoff.notOffered': 'Ta strona nie loguje innych programów.',
	'session.ended': 'Twoja sesja wygasła. Zaloguj się ponownie.',
	'session.accessRemoved': 'Twój dostęp do tej przestrzeni roboczej się zmienił. Zaloguj się ponownie.',
	'error.generic': 'Coś poszło nie tak. Spróbuj ponownie.',
	'workspace.empty': 'Nie należysz jeszcze do żadnej przestrzeni roboczej.',
	'workspace.current': 'Bieżąca',
	'password.tooShort': 'Użyj co najmniej {count} znaków.',
	'feature.upgrade': 'Zmień plan, by z tego korzystać',
};

/** The plugin's copy by primary language subtag. */
export const PLUGIN_LOCALES: Readonly<Record<string, PluginMessages>> = { da, de, en, es, fi, fr, it, nb, nl, pl, pt, sv };

export const PLUGIN_EN: PluginMessages = en;
