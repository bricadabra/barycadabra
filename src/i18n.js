/**
 * French and English, in one dictionary. Keys in, words out: nothing here
 * decides anything.
 */

const STRINGS = {
  fr: {
    locale: "fr-FR",
    subtitle: "Le bar juste pour tout le monde",
    "link.org": "Bricadabra, le collectif derrière barycadabra",
    "link.repo": "Code source sur GitHub",
    "group.title": "Le groupe",
    "group.empty": "Ajoutez chaque personne avec son adresse de départ et son moyen de transport.",
    "group.name": "Prénom",
    "group.address": "Adresse de départ",
    "group.add": "Ajouter",
    "group.adding": "Localisation…",
    "group.remove": "Retirer {name}",
    "group.notFound": "Adresse introuvable : {q}",
    "group.full": "{n} personnes au plus",
    "mode.car": "Voiture",
    "mode.bike": "Vélo",
    "mode.foot": "À pied",
    "search.go": "Trouver le lieu",
    "search.need": "Il faut au moins deux personnes.",
    "search.loading": "Calcul des trajets…",
    "search.none": "Aucun lieu de ce type dans la zone de rencontre.",
    "results.title": "{n} lieux classés",
    "results.more": "Afficher {n} de plus",
    "results.share": "Partager",
    "results.copied": "Lien copié",
    "results.copyFailed": "Copie impossible, le lien est dans la barre d'adresse",
    "results.mean": "{min} en moyenne, {max} au plus",
    "results.gap.ahead": "avantagé",
    "results.gap.behind": "pénalisé",
    "results.gap.even": "dans la moyenne",
    "results.routes": "Trajets",
    "results.website": "Site",
    "results.hours": "Horaires",
    "results.directions": "Itinéraire",
    "imported": "Groupe importé depuis le lien",
    "group.needName": "Ajoutez un prénom pour cette adresse.",
    "infos.open": "Infos",
    "infos.title": "Infos",
    "infos.close": "Fermer",
    "infos.scoreTitle": "Le BaryScore",
    "infos.score": "Chaque lieu reçoit une note de 0 à 100 calculée à partir du temps de trajet estimé de chaque personne, avec son propre moyen de transport. Deux critères, dont vous réglez le dosage avec le curseur (par défaut 85 / 15) :",
    "infos.proximity": "proximité : la durée moyenne des trajets du groupe (100 à 0 min, 0 à partir de 66 min) ;",
    "infos.fairness": "équité : l'écart entre les trajets (coefficient de variation), pour qu'un bar à côté pour trois personnes et à une heure pour la quatrième perde face à un bar à vingt minutes pour tous.",
    "infos.timesTitle": "Les temps de trajet",
    "infos.times": "Ce sont des estimations calculées dans votre navigateur à partir de données précalculées sur le réseau routier, pas un calcul d'itinéraire : aucun service de routage n'est appelé. Assez justes pour comparer des lieux, pas pour partir à l'heure ; chaque bar renvoie vers un vrai itinéraire.",
    "infos.coverageTitle": "Couverture",
    "infos.coverage": "France métropolitaine uniquement (Corse comprise). Les adresses hors de cette zone ne sont pas proposées. Les catégories de lieux s'étoffent au fil des données publiées.",
    "infos.privacyTitle": "Vie privée",
    "infos.privacy": "Pas de compte, pas de serveur : le groupe reste dans votre navigateur et n'en sort que par le lien de partage. Seules les adresses saisies partent vers le géocodeur de l'IGN.",
    "infos.creditsTitle": "Sources et attributions",
    "infos.creditOsm": "lieux et réseau routier",
    "infos.creditBasemap": "fond de carte",
    "infos.creditGeocoder": "recherche d'adresses",
    "infos.creditFont": "carte ; police",
    "infos.code": "Code source :",
    "group.modeFor": "Moyen de transport de {name}",
    "limit.placeholder": "max",
    "limit.title": "Temps de trajet maximum, en minutes (facultatif)",
    "limit.for": "Temps maximum pour {name}, en minutes",
    "where.title": "Où se retrouver ?",
    "cat.bar": "Bar",
    "cat.cafe": "Café",
    "cat.restaurant": "Restaurant",
    "cat.park": "Parc",
    "cat.station": "Gare",
    "cat.unnamed.bar": "Bar sans nom",
    "cat.unnamed.cafe": "Café sans nom",
    "cat.unnamed.restaurant": "Restaurant sans nom",
    "cat.unnamed.park": "Parc sans nom",
    "cat.unnamed.station": "Gare sans nom",
    "weight.label": "Équilibre entre proximité et équité",
    "weight.proximity": "Proximité",
    "weight.fairness": "Équité",
    "zone.label": "Zone où tous arrivent en moins de",
    "zone.none": "—",
    "search.limited": "Aucun lieu ne respecte les temps maximum. La limite de {name} est la plus restrictive : relâchez-la.",
    "share.text": "Où se retrouver ? Le classement de barycadabra pour notre groupe",
    "infos.limitsTitle": "Temps maximum et zone",
    "infos.limits": "Un temps maximum par personne (facultatif) écarte tout lieu qui le dépasse. La zone de rendez-vous colore sur la carte les endroits où tout le monde arrive en moins du temps choisi.",
    "error.data": "Les données des lieux et des trajets n'ont pas pu être chargées. Réessayez dans un instant.",
  },
  en: {
    locale: "en-GB",
    subtitle: "The bar that is fair to everyone",
    "link.org": "Bricadabra, the collective behind barycadabra",
    "link.repo": "Source code on GitHub",
    "group.title": "The group",
    "group.empty": "Add each person with where they start from and how they travel.",
    "group.name": "Name",
    "group.address": "Starting address",
    "group.add": "Add",
    "group.adding": "Locating…",
    "group.remove": "Remove {name}",
    "group.notFound": "Address not found: {q}",
    "group.full": "{n} people at most",
    "mode.car": "Car",
    "mode.bike": "Bike",
    "mode.foot": "On foot",
    "search.go": "Find the place",
    "search.need": "At least two people are needed.",
    "search.loading": "Working out the trips…",
    "search.none": "No place of this kind in the meeting area.",
    "results.title": "{n} places ranked",
    "results.more": "Show {n} more",
    "results.share": "Share",
    "results.copied": "Link copied",
    "results.copyFailed": "Could not copy, the link is in the address bar",
    "results.mean": "{min} on average, {max} at most",
    "results.gap.ahead": "ahead",
    "results.gap.behind": "behind",
    "results.gap.even": "on par",
    "results.routes": "Trips",
    "results.website": "Website",
    "results.hours": "Hours",
    "results.directions": "Directions",
    "imported": "Group imported from the link",
    "group.needName": "Add a name for this address.",
    "infos.open": "About",
    "infos.title": "About",
    "infos.close": "Close",
    "infos.scoreTitle": "The BaryScore",
    "infos.score": "Each place is scored 0 to 100 from the estimated trip of every person, each with their own way of travelling. Two criteria, blended as you set the slider (85 / 15 by default):",
    "infos.proximity": "proximity: the group's mean trip (100 at 0 min, 0 from 66 min);",
    "infos.fairness": "fairness: how even the trips are (coefficient of variation), so that a bar next door for three people and an hour away for the fourth loses to one twenty minutes from everyone.",
    "infos.timesTitle": "Trip times",
    "infos.times": "They are estimates computed in your browser from data precomputed on the road network, not routing: no routing service is called. Close enough to compare places, not to leave on time; each bar links to real directions.",
    "infos.coverageTitle": "Coverage",
    "infos.coverage": "Metropolitan France only (Corsica included). Addresses outside it are not offered. Place categories grow as the data is published.",
    "infos.privacyTitle": "Privacy",
    "infos.privacy": "No account, no server: the group stays in your browser and only leaves it through the share link. Only the addresses typed go to the IGN geocoder.",
    "infos.creditsTitle": "Sources and credits",
    "infos.creditOsm": "places and road network",
    "infos.creditBasemap": "basemap",
    "infos.creditGeocoder": "address search",
    "infos.creditFont": "map; typeface",
    "infos.code": "Source code:",
    "group.modeFor": "How {name} travels",
    "limit.placeholder": "max",
    "limit.title": "Longest acceptable trip, in minutes (optional)",
    "limit.for": "Longest trip for {name}, in minutes",
    "where.title": "Where to meet?",
    "cat.bar": "Bar",
    "cat.cafe": "Café",
    "cat.restaurant": "Restaurant",
    "cat.park": "Park",
    "cat.station": "Station",
    "cat.unnamed.bar": "Unnamed bar",
    "cat.unnamed.cafe": "Unnamed café",
    "cat.unnamed.restaurant": "Unnamed restaurant",
    "cat.unnamed.park": "Unnamed park",
    "cat.unnamed.station": "Unnamed station",
    "weight.label": "Balance between proximity and fairness",
    "weight.proximity": "Proximity",
    "weight.fairness": "Fairness",
    "zone.label": "Zone everyone reaches in under",
    "zone.none": "—",
    "search.limited": "No place keeps within the time limits. {name}'s limit is the tightest: relax it.",
    "share.text": "Where shall we meet? Barycadabra's ranking for our group",
    "infos.limitsTitle": "Time limits and zone",
    "infos.limits": "An optional time limit per person rules out any place beyond it. The meeting zone shades on the map where everyone arrives within the time chosen.",
    "error.data": "Places and travel data could not be loaded. Please try again in a moment.",
  },
};

const LANG_KEY = "barycadabra.lang";

let lang = "fr";
const listeners = new Set();

/** Translate a key, substituting {placeholders} from `vars`. */
export function t(key, vars) {
  let s = STRINGS[lang][key] ?? STRINGS.fr[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v);
  return s;
}

export const getLang = () => lang;

export function setLang(next) {
  if (!STRINGS[next] || next === lang) return;
  lang = next;
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    /* nothing to do */
  }
  document.documentElement.lang = lang;
  applyStatic();
  listeners.forEach((fn) => fn());
}

export const onLangChange = (fn) => listeners.add(fn);

/** Fill the elements that carry their key in the markup. */
export function applyStatic(root = document) {
  root.querySelectorAll("[data-i18n]").forEach((el) => (el.textContent = t(el.dataset.i18n)));
  root.querySelectorAll("[data-i18n-title]").forEach((el) => (el.title = t(el.dataset.i18nTitle)));
  root.querySelectorAll("[data-i18n-label]").forEach((el) => el.setAttribute("aria-label", t(el.dataset.i18nLabel)));
  root.querySelectorAll("[data-i18n-placeholder]").forEach((el) => (el.placeholder = t(el.dataset.i18nPlaceholder)));
}

export function initI18n() {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved && STRINGS[saved]) lang = saved;
  } catch {
    /* the default stands */
  }
  document.documentElement.lang = lang;
  applyStatic();
}
