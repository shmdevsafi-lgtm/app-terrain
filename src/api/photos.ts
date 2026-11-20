import type { PhotoDraft } from '../types';
import { getClient } from './client';

export const MAX_PHOTOS = 3;
const MAX_SOURCE = 20 * 1024 * 1024; // 20 Mo avant compression
const MAX_DIMENSION = 1600;
const QUALITE = 0.72;

/** Bucket Supabase Storage (public) créé par supabase/SUPABASE_STORAGE.sql. */
export const BUCKET_PHOTOS = import.meta.env.VITE_PHOTOS_BUCKET || 'photos-controles';

/**
 * Le stockage photos est-il configuré ?
 * Avec Supabase Storage, il suffit que le projet Supabase soit renseigné
 * (le bucket et ses politiques sont créés par la migration SQL).
 */
export function stockagePhotosConfigure(): boolean {
  return Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
}

/**
 * Compresse la photo dans le navigateur avant l'envoi : 1600 px maximum,
 * JPEG qualité 0,72. Une photo de téléphone passe ainsi de ~4 Mo à ~200-300 Ko.
 */
export async function compresserPhoto(file: File): Promise<PhotoDraft> {
  if (!file.type.startsWith('image/')) {
    throw new Error(`« ${file.name} » n'est pas une image.`);
  }
  if (file.size > MAX_SOURCE) {
    throw new Error(`« ${file.name} » dépasse 20 Mo.`);
  }

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' } as any);
  } catch {
    bitmap = null;
  }

  let largeur: number;
  let hauteur: number;
  let source: CanvasImageSource;
  let urlTemporaire: string | null = null;

  if (bitmap) {
    largeur = bitmap.width;
    hauteur = bitmap.height;
    source = bitmap;
  } else {
    urlTemporaire = URL.createObjectURL(file);
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Format d'image non pris en charge : ${file.name}`));
      img.src = urlTemporaire!;
    });
    largeur = image.naturalWidth;
    hauteur = image.naturalHeight;
    source = image;
  }

  const ratio = Math.min(1, MAX_DIMENSION / Math.max(largeur, hauteur));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(largeur * ratio));
  canvas.height = Math.max(1, Math.round(hauteur * ratio));
  const contexte = canvas.getContext('2d');
  if (!contexte) throw new Error("Cet appareil ne permet pas de compresser l'image.");
  contexte.imageSmoothingQuality = 'high';
  contexte.drawImage(source, 0, 0, canvas.width, canvas.height);
  bitmap?.close();
  if (urlTemporaire) URL.revokeObjectURL(urlTemporaire);

  const dataUrl = canvas.toDataURL('image/jpeg', QUALITE);
  const blob = await (await fetch(dataUrl)).blob();
  const identifiant =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return {
    id: identifiant,
    nom: `${file.name.replace(/\.[^.]+$/, '')}.jpg`,
    dataUrl,
    taille: blob.size,
  };
}

const nettoyer = (valeur: string) =>
  valeur
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();

/** Chemin de stockage : secteur/AAAA-MM/jeton-fichier.jpg */
function cheminStockage(secteur: string, nomFichier: string): string {
  const maintenant = new Date();
  const mois = `${maintenant.getFullYear()}-${String(maintenant.getMonth() + 1).padStart(2, '0')}`;
  const jeton =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const base = nettoyer(nomFichier.replace(/\.[^.]+$/, '')) || 'photo';
  return `${nettoyer(secteur) || 'secteur'}/${mois}/${jeton}-${base}.jpg`;
}

/**
 * Téléverse les photos compressées dans le bucket Supabase Storage
 * `photos-controles`, puis renvoie leurs URLs publiques.
 * Le navigateur utilise uniquement la clé anon : les politiques Storage
 * n'autorisent que l'insertion dans ce bucket (jamais la suppression).
 */
export async function televerserPhotos(
  photos: PhotoDraft[],
  secteur: string,
  unite: string,
  onProgress?: (envoyees: number, total: number) => void,
): Promise<string[]> {
  if (!photos.length) return [];

  const client = getClient();
  const bucket = client.storage.from(BUCKET_PHOTOS);
  const urls: string[] = [];

  for (let index = 0; index < photos.length; index += 1) {
    onProgress?.(index + 1, photos.length);
    const photo = photos[index];
    const blob = await (await fetch(photo.dataUrl)).blob();
    const chemin = cheminStockage(secteur, photo.nom);

    const { error } = await bucket.upload(chemin, blob, {
      contentType: 'image/jpeg',
      cacheControl: '31536000',
      upsert: false,
    });

    if (error) {
      const message = `${error.message ?? ''}`.toLowerCase();
      if (message.includes('bucket not found')) {
        throw new Error(
          "Bucket « photos-controles » introuvable : exécutez supabase/SUPABASE_STORAGE.sql dans Supabase.",
        );
      }
      if (message.includes('row-level security') || message.includes('unauthorized') || message.includes('policy')) {
        throw new Error(
          "Supabase Storage a refusé l'envoi : vérifiez les politiques du bucket (supabase/SUPABASE_STORAGE.sql).",
        );
      }
      throw new Error(`Envoi de la photo impossible (${error.message ?? 'erreur Storage'}).`);
    }

    urls.push(bucket.getPublicUrl(chemin).data.publicUrl);
  }

  void unite;
  return urls;
}
