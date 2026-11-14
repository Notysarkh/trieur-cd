# Trieur à CD

Application web installable (PWA) pour scanner ses CD, les identifier automatiquement et, dans les prochaines étapes, les classer et les ranger dans ses meubles.

Tout fonctionne **dans le navigateur** : pas de serveur, pas de compte, données stockées sur l'appareil.

**Adresse de l'appli : https://notysarkh.github.io/trieur-cd/**

## Installer l'appli sur le téléphone

- **Android (Chrome)** : ouvre l'adresse ci-dessus, menu ⋮ → *Installer l'application* (ou *Ajouter à l'écran d'accueil*).
- **iPhone (Safari)** : ouvre l'adresse, bouton *Partager* (carré avec une flèche) → *Sur l'écran d'accueil*.

L'appli s'ouvre alors en plein écran comme une vraie application et fonctionne hors ligne pour la consultation (il faut internet pour identifier les CD).

À savoir :
- les données restent sur chaque appareil : le téléphone et le PC ont chacun leur collection. Pour passer de l'un à l'autre : Réglages → *Exporter*, puis *Importer* sur l'autre appareil ;
- le jeton Discogs se saisit sur chaque appareil (il n'est jamais transféré) ;
- l'adresse en ligne et la version de développement (localhost) sont deux « appareils » différents : leurs données ne se mélangent pas.

## Mettre à jour l'appli en ligne

Chaque modification envoyée sur GitHub (branche `main`) est testée puis publiée automatiquement en 2 minutes environ (onglet *Actions* du dépôt https://github.com/Notysarkh/trieur-cd). L'appli installée se met à jour toute seule à la prochaine ouverture.

## Où en est le projet

| Étape | Contenu | État |
|---|---|---|
| 1 | Scan code-barres, identification MusicBrainz + Discogs, file d'attente, collection, à vérifier, sauvegarde JSON | ✅ fait |
| 2 | Classification thème → artiste → albums, règles éditables, aperçu avant application | ✅ fait |
| 3 | Configurateur de meubles, répartition case par case, vue visuelle | ✅ fait |
| 4 | Plan imprimable (PDF), étiquettes, recherche « où est ce CD ? », export/import CSV, insertion d'un nouveau CD | ✅ fait |

## Lancer l'appli sur le PC

Ouvre un terminal dans ce dossier, puis :

```bash
npm install
```

```bash
npm run dev
```

Ouvre ensuite http://localhost:5173 dans ton navigateur. Sur PC, il n'y a pas de caméra : tape les codes-barres dans le champ prévu (une douchette USB fonctionne aussi, elle « tape » le code).

## Tester sur le téléphone (même Wi-Fi que le PC)

Le téléphone n'autorise la caméra que sur une adresse sécurisée (https). Pour les tests, on lance une version https avec un certificat « maison » :

```bash
npm run dev:phone
```

1. Le terminal affiche une ligne `Network: https://192.168.x.x:5173/` : ouvre cette adresse sur le téléphone.
2. Le navigateur prévient que la connexion « n'est pas privée » (normal, le certificat est fait maison) : *Paramètres avancés → Continuer*.
3. Si Windows demande d'autoriser Node.js sur le réseau, accepte pour les **réseaux privés**.
4. Onglet **Scanner** → *Démarrer la caméra* → autorise la caméra.

Limite de ce mode de test : à cause du certificat « maison », le téléphone refusera d'**installer** l'appli et de la faire marcher **hors ligne**. Pour ces deux fonctions, utilise l'adresse en ligne ci-dessus. Le mode hors ligne a été vérifié sur PC, avec `npm run build` puis `npm run preview`.

## Classement (étape 2)

Onglet **Classement** : l'appli propose un plan **thème → artiste (A → Z) → albums (du plus ancien au plus récent)**, recalculé en direct. Rien ne change dans ta collection tant que tu n'as pas appuyé sur **Appliquer ce classement**.

- **Un artiste = un seul thème** : chacun de ses CD « vote » d'après ses genres et styles, et l'artiste va dans le thème majoritaire. Les artistes partagés (moins de 60 % des voix) sont listés « à cheval » pour que tu vérifies.
- **Forcer un artiste** : liste déroulante à droite de son nom (« Auto » = choix de l'appli).
- **Catégories spéciales** : Compilations multi-artistes (par titre), BO de films (par titre de film), Classique (par compositeur, champ « Compositeur » des fiches), Enfants, Musique française (option).
- **Compléter ma collection** : récupère les fiches d'artistes MusicBrainz (genres, pays) et, avec un jeton Discogs, les styles des CD qui n'en ont pas. Environ 1 seconde par élément, en arrière-plan.
- **Thèmes et règles** : renommer, changer la couleur, réordonner (ordre des meubles), ajouter ou retirer des mots-clés, fusionner, scinder (choisir des styles pour créer un nouveau thème), nombre max de thèmes, minimum de CD par thème, thème parent.

## Rangement (étape 3)

Onglet **Rangement** : l'appli répartit la collection dans tes meubles en suivant l'ordre du classement, et dessine chaque meuble avec ses rangées colorées par thème (premier → dernier artiste, nombre de CD, remplissage). Touche une rangée pour voir ses CD de gauche à droite. **Appliquer ce rangement** enregistre l'emplacement de chaque CD (visible dans sa fiche : « Billy · niveau 3 · derrière · 12e CD en partant de la gauche »).

- **Ordre de remplissage** : meuble par meuble (ordre de « Mes meubles »), de haut en bas, de gauche à droite, rangée de devant puis de derrière.
- **Marge de croissance** (15 % par défaut) : chaque rangée n'est remplie qu'à 87 % environ, pour pouvoir insérer un futur CD à sa place sans tout décaler.
- **Artistes non coupés** : un artiste qui ne tient pas en entier passe à la rangée suivante, sauf si cela laisserait plus d'un tiers de la rangée vide (il est alors coupé, et c'est signalé).
- **Conseils** : surcharge (avec la marge qui permettrait de tout ranger), rangées vides en fin de meuble, artistes coupés.
- **Mes meubles** : niveaux, cases par niveau, largeur / hauteur / profondeur utiles, double rangée, deux couches, cases réservées à autre chose (décocher), ordre de remplissage, et modèles prêts à l'emploi (meuble CD, Billy 80 et 40, Kallax 4×4 / 2×4 / 1×4, étagère générique).

## Sorties et usage au quotidien (étape 4)

- **Ranger toute une pile** (après un scan d'inventaire de toute la collection) : applique le rangement, puis onglet **Scanner → 📦 Ranger mes CD**. Rescanne chaque CD de la pile : l'appli affiche en grand son emplacement (meuble, niveau, devant/derrière, n°), ses voisins, et le compte comme rangé (compteur « 312 / 700 rangés »). « Ordre de la rangée » donne la liste complète pour remettre chaque étagère dans l'ordre. Pas besoin de faire des lots pendant le scan.
- **Où est ce CD ?** Onglet Collection : tape quelques lettres de l'artiste ou du titre. Chaque CD affiche son emplacement (📍 « Billy · niv. 2 · devant · n° 12 »). Sa fiche montre un petit dessin du meuble avec la rangée en surbrillance.
- **Plan imprimable** (Rangement → 🖨️) : meuble par meuble, rangée par rangée, la liste numérotée des CD. « Imprimer » ouvre la fenêtre d'impression : choisis « Enregistrer au format PDF » pour un fichier.
- **Étiquettes intercalaires** (Rangement → 🏷️) : « Rock — A à G »… une par thème et par rangée, par lettre ou par thème. Deux formats : étiquettes 63,5 × 33,9 mm (24 par page A4) ou intercalaires 12 × 14 cm (2 par page) à coller sur du carton.
- **Nouveau CD** : une fois le rangement appliqué, un CD ajouté s'affiche dans « Nouveaux CD à ranger » (onglet Rangement, et dans sa fiche) avec sa place exacte (« juste après X, juste avant Y »). « C'est rangé » l'enregistre : seuls ses voisins de droite glissent d'une place, aucune autre rangée ne bouge.
- **Tableur (CSV)** (Réglages) : export de toute la collection avec thème et emplacement (séparateur « ; », accents et codes-barres préservés pour Excel). Import : une ligne avec un id connu met ce CD à jour (cellules vides = inchangé), une ligne sans id ajoute un CD. Thème, emplacement et confiance ne sont pas relus.
- **Sauvegarde complète (JSON)** : toujours dans Réglages, pour passer du téléphone au PC.

## Version 1.1 (en cours)

- **Étape A ✅** : indicateur « sans code-barres » (coché automatiquement quand il n'y a pas de code), statut « à ranger / rangé le … » visible partout (filtres dans la Collection), thème choisi sur la fiche d'un CD (il s'applique à tout l'artiste ; un choix fait dans l'écran Classement reste prioritaire), et « Compilation perso » (CD gravé, mix) : un nom, un thème choisi, rangée à la fin de ce thème par ordre alphabétique.
- **Étape B ✅** : fiche « Où le ranger » en 3 blocs : emplacement (avec dessin du meuble), liste théorique (le plan : 2 CD avant / 2 après, réglable dans Réglages, badges « Rangé ✓ » / « À ranger »), liste réelle (voisins déjà posés, « Place-le entre X et Y », « Identique au plan ✓ », début / fin de rangée avec le voisin le plus proche, place à laisser pour les CD encore à venir, rangée vide → « place-le à gauche / au centre / à droite »). Gros bouton « Rangé ✓ » (le scan ne compte plus automatiquement), « Annuler », progression totale / par meuble / par rangée. Dans le Scanner (mode « Ranger mes CD », caméra en pause pendant la fiche) et dans la fiche de chaque CD.
- Étape C : CD sans code-barres : liste dédiée, mode « pile triée », liste imprimable à cocher.
- Étape D : recherche instantanée tolérante aux fautes, « où est ce CD ? » avec voisins théoriques et réels.

## Commandes utiles

| Commande | Rôle |
|---|---|
| `npm run dev` | Lance l'appli en local (PC) |
| `npm run dev:phone` | Lance l'appli en https, accessible depuis le téléphone |
| `npm test` | Lance les tests automatiques |
| `npm run build` | Prépare la version à mettre en ligne (dossier `dist`) |

## Organisation du code

```
src/
  db/          base de données locale (types de données + tables)
  classification/  thèmes par défaut et moteur de classement (sans écran, testé à part)
  layout/      meubles, répartition, insertion d'un nouveau CD, étiquettes (sans écran, testés à part)
  lib/         petits outils : codes-barres, noms de tri, formats/épaisseurs, comparaison de textes
  services/    MusicBrainz, Discogs, identification + confiance, file de scan, collection, sauvegarde, réglages
  components/  éléments d'écran réutilisables (lecteur de code-barres, pochette, formulaire CD…)
  views/       les écrans : Collection, Scanner, À vérifier, Ajouter, Fiche CD, Classement, Thèmes, Rangement, Meubles, Plan imprimable, Étiquettes, Réglages
```

## Hypothèses à connaître

- **Indice de confiance** (fichier `src/services/identify.ts`) : MusicBrainz 65, plus 20 si un seul album porte ce code (moins 20 s'il y en a plusieurs), plus 10 si Discogs confirme, moins 15 s'il contredit, moins 10 si le genre est inconnu. Seuil « identifié » : 80. Le barème est à ajuster à l'usage.
- **Épaisseurs** : standard 10,4 mm, slim 5,2 mm, double épais 24 mm, digipak 7 mm, carton 4 mm, coffret 30 mm. Les quatre dernières valeurs sont des estimations, modifiables dans les Réglages.
- **Année** : on garde l'année de **première sortie de l'album** (ex. *Rubber Soul* 1965, même pour un CD de 1987) pour le tri chronologique. L'année de l'édition est conservée à part.
- **User-Agent MusicBrainz** : un navigateur ne permet pas de le modifier. C'est celui du navigateur qui part, ce que MusicBrainz accepte (seuls les User-Agent vides ou génériques sont bridés). La limite d'1 requête par seconde est respectée.
- **Thèmes par défaut** (fichier `src/classification/themes.ts`) : 15 thèmes : Rock, Metal / Hard rock, Pop, Musique française, Électro, Hip-hop / Rap, Soul / Funk / R&B, Jazz / Blues, Folk / Country, Musiques du monde, Classique, BO de films, Enfants, Compilations, Divers. Au plus 12 thèmes et au moins 5 CD par thème : au-delà, les plus petits rejoignent leur thème parent (ex. Metal → Rock). La correspondance genres → thèmes est une liste de mots-clés à ajuster.
- **Thèmes créés par toi** (ajout ou scission) : jamais regroupés automatiquement, même s'ils sont petits. Ils peuvent donc faire dépasser le nombre maximum de thèmes.
- **Poids des votes** : grand genre 1, style 1,5, album marqué « Soundtrack » 3 (vers BO).
- **Musique française** : un artiste y va si la majorité de ses CD sont chantés en français (langue MusicBrainz). Si la langue est inconnue, on regarde son pays (France). Daft Punk, chanté en anglais, reste donc en Électro. Ne s'applique pas au classique, aux BO, aux disques pour enfants ni aux compilations.
- **Classique** : MusicBrainz crédite en général le compositeur en premier. Le tri utilise le champ « Compositeur » s'il est rempli, sinon le nom de tri de l'artiste.
- **Tes meubles** (fichier `src/layout/furniture.ts`) : meuble CD rempli en premier, 11 niveaux de 41 cm utiles (≈ 39 CD standard par niveau ; tu en comptes 38), 15 cm de profondeur, hauteur utile estimée à 13,5 cm. Billy ensuite : **80 cm de large supposés (76 cm utiles), 26 cm de profondeur utile, 6 tablettes en double rangée** : à corriger dans « Mes meubles » si besoin, et à décocher pour les tablettes réservées aux livres.
- **Double rangée dans le Billy** : il faut 28,4 cm de profondeur pour deux boîtiers ; avec 26 cm, la rangée de devant dépasse d'environ 2,4 cm (signalé, pas bloquant).
- **Boîtiers** : 14,2 cm de profondeur et 12,5 cm de hauteur (standard). Les coffrets plus grands ne sont pas pris en compte en hauteur.
- **Plan et étiquettes** utilisent les emplacements enregistrés (dernier rangement appliqué + CD insérés depuis), pas le calcul en cours.
- **Format des étiquettes** : planche type Avery L7159 (3 × 8) supposée ; imprime d'abord une page sur papier ordinaire pour vérifier l'alignement. Intercalaires de 14 cm de haut : ils dépassent d'environ 1,5 cm au-dessus des boîtiers (12,5 cm).
- **Rangée pleine** à l'insertion : l'appli le signale et conseille de pousser le dernier CD de la rangée au début de la suivante ; après beaucoup d'ajouts, mieux vaut réappliquer le rangement complet.
- **Synchro téléphone ↔ PC** : manuelle, par fichier (Réglages → Exporter, puis Importer sur l'autre appareil). L'import fusionne et ne supprime jamais rien.
