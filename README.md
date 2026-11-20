# Contrôle des douches de sécurité — site terrain

SPA statique (Vite + React). **Aucune base Netlify, aucun serveur, aucune
fonction Netlify, aucune clé `service_role`.**

- **Données** : Supabase, appelé directement avec l'URL du projet et la clé
  `anon` (RPC uniquement, pas d'accès direct aux tables).
- **Photos** : Supabase Storage, bucket public `photos-controles`.
  L'upload se fait depuis le navigateur avec la clé `anon` ; les URLs sont
  enregistrées dans la colonne `photos_urls` du rapport.

## Variables d'environnement

```env
# Obligatoires (Supabase → Project Settings → API)
VITE_SUPABASE_URL=https://ayshwltvfmrlnkswpjld.supabase.co
VITE_SUPABASE_ANON_KEY=...

# Photos (facultatif, "photos-controles" par défaut)
VITE_PHOTOS_BUCKET=photos-controles
```

Avant la première utilisation des photos, exécuter une fois
`supabase/SUPABASE_STORAGE.sql` dans Supabase → SQL Editor : il crée le bucket,
les politiques Storage, la colonne `photos_urls` et la fonction RPC à jour.
Sans ce script, le formulaire fonctionne normalement **sans photos**.

## Déploiement Netlify

1. Build command : `npm run build` — Publish directory : `dist`.
2. Ajouter les variables **avant** le build (*Site settings → Environment
   variables*).
3. Déployer. Après toute modification des variables :
   *Deploys → Trigger deploy → Clear cache and deploy site*.

Les variables Vite sont lues **au moment du build**. Si elles manquent, le site
affiche « Le site n'est pas encore relié à Supabase ».

## Développement local

```bash
npm install
cp .env.example .env
npm run dev
```

## Photos : Supabase Storage

La troisième page accepte **3 photos maximum**, compressées dans le navigateur
(1600 px, JPEG ~250 Ko). Une photo de ~4 Mo descend à ~250 Ko, ce qui limite
fortement le stockage et la consommation de données terrain.

Le navigateur utilise uniquement la clé `anon` de Supabase : il téléverse dans
le bucket public `photos-controles`, puis enregistre les URLs publiques dans la
colonne `photos_urls` du rapport (via `inserer_rapport`).

### Mise en place (une seule fois)

Coller `supabase/SUPABASE_STORAGE.sql` dans **Supabase → SQL Editor → Run**.
Le script :

1. crée le bucket `photos-controles` (public, 5 Mo max par fichier, JPEG/PNG/WebP) ;
2. ajoute les politiques Storage (insertion anonyme, lecture publique, aucune
   suppression) ;
3. ajoute la colonne `photos_urls text[]` aux trois tables de rapports ;
4. remplace `inserer_rapport` par la version qui enregistre les URLs.

Vérification : la requête finale du script doit renvoyer
`fonction_photos_ok`, `bucket_ok` et `colonne_photos_urls_ok` à `true`.

Sans ce script, le formulaire reste utilisable **sans photo** ; l'ajout d'une
photo affiche un message explicite.

### Arborescence du bucket

```
photos-controles/
  lf/2026-11/<uuid>-nom-du-fichier.jpg
  nissan/2026-11/<uuid>-nom-du-fichier.jpg
  st/2026-11/<uuid>-nom-du-fichier.jpg
```

Le nom de fichier est nettoyé et préfixé par un UUID : pas de collision, pas de
caractère accentué dans les URLs.


## Application Android (Capacitor)

Le site terrain est empaqueté pour Android via Capacitor. La configuration est
dans `capacitor.config.ts` (appId `com.hsely.douches`, nom « Douches de
sécurité », `webDir = dist`), et le projet natif est dans `android/`.

```bash
npm install
npm run build:mobile     # vite build + cap sync android
npx cap open android     # ouvre Android Studio
```

Pour un APK en ligne de commande (Android SDK installé) :

```bash
cd android && ./gradlew assembleDebug
# APK : android/app/build/outputs/apk/debug/app-debug.apk
```

À chaque modification du site : `npm run build:mobile` puis relancer le build
Android. Les icônes et l'écran de démarrage sont générés à partir de
`public/logo-hsely.png` (mipmap-*/ic_launcher*, drawable-*/splash.png) : fond
blanc, logo HSELY centré, aucune icône Capacitor.

Les variables Supabase restent lues **au build** : renseigner l'URL et la clé
anon avant `npm run build:mobile`.

## Côté Supabase

Le formulaire appelle uniquement :

- `rpc/inserer_rapport(...)` pour transmettre un contrôle (avec ou sans photos) ;
- `rpc/referentiel_lieux()` pour rafraîchir la liste des emplacements
  (repli automatique sur la liste embarquée si l'appel échoue).

Aucune table n'est lue ni écrite directement par le navigateur. Si le projet est
recréé, exécuter `SETUP.sql` puis `SUPABASE_STORAGE.sql` dans le **SQL Editor**.

## Routes

- `/rapport/secteur`
- `/rapport/identification`
- `/rapport/verification`

La redirection Netlify `/* → /index.html` gère les accès directs et le
rafraîchissement.
