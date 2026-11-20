-- =============================================================================
--  PHOTOS DES CONTRÔLES — STOCKAGE DIRECT DANS SUPABASE (prototype)
--
--  À coller une fois dans Supabase → SQL Editor → Run.
--
--  Ce script :
--    1. crée le bucket public `photos-controles` ;
--    2. autorise l'upload anonyme (anon) dans ce bucket uniquement ;
--    3. ajoute la colonne `photos_urls` (text[]) aux trois tables de rapports ;
--    4. met à jour la fonction inserer_rapport pour enregistrer ces URLs.
--
--  Idempotent : peut être relancé sans casser l'existant.
--  Aucune clé service_role n'est utilisée côté site.
-- =============================================================================

-- 1) Bucket de stockage -------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'photos-controles',
  'photos-controles',
  true,
  5242880, -- 5 Mo par fichier (les images sont compressées à ~250 Ko avant envoi)
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 2) Politiques d'accès au bucket --------------------------------------------
-- Lecture : bucket public (URL publique). Écriture : anon, insertion seule.
-- Aucune politique de suppression / mise à jour : un rapport est immuable.
drop policy if exists "photos_controles_insert" on storage.objects;
create policy "photos_controles_insert"
  on storage.objects
  for insert
  to anon, authenticated
  with check (bucket_id = 'photos-controles');

drop policy if exists "photos_controles_read" on storage.objects;
create policy "photos_controles_read"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'photos-controles');

-- 3) Colonnes photos_urls ----------------------------------------------------
alter table public.rapports_lf     add column if not exists photos_urls text[] not null default '{}';
alter table public.rapports_nissan add column if not exists photos_urls text[] not null default '{}';
alter table public.rapports_st     add column if not exists photos_urls text[] not null default '{}';

-- 4) Fonction de transmission ------------------------------------------------
-- Une seule signature : les photos sont désormais des URLs Supabase Storage.
-- `p_photos` (jsonb) reste accepté pour les anciens clients et mirroré.
drop function if exists public.inserer_rapport(text, text, text, text, text, jsonb, text);
drop function if exists public.inserer_rapport(text, text, text, text, text, jsonb, text, jsonb);

create or replace function public.inserer_rapport(
  p_secteur text, p_nom text, p_prenom text, p_unite text, p_emplacement text,
  p_reponses jsonb, p_remarques text,
  p_photos_urls text[] default '{}',
  p_photos jsonb default '[]'::jsonb
)
returns table (rapport_id uuid, recu_le timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_table text;
  v_rapporteur uuid;
  v_nombre bigint;
  v_urls text[] := coalesce(p_photos_urls, '{}');
  v_url text;
  v_cles text[] := array['pomme', 'vanne_1', 'palette', 'vanne_2', 'vasque', 'rampe_2_sorties',
                         'erogateurs', 'tige_commande', 'pedale', 'flotteur', 'ressort', 'qualite_eau'];
begin
  if p_secteur not in ('LF', 'NISSAN', 'ST')
     or jsonb_typeof(p_reponses) <> 'object'
     or jsonb_typeof(coalesce(p_photos, '[]'::jsonb)) <> 'array' then
    raise exception 'entree invalide' using errcode = '22023';
  end if;

  if array_length(v_urls, 1) > 3 then
    raise exception 'trop_de_photos' using errcode = '22023';
  end if;

  -- Les URLs doivent pointer vers le bucket Supabase du projet.
  foreach v_url in array v_urls loop
    if v_url is null
       or v_url !~ '^https://[a-z0-9.-]+/storage/v1/object/public/photos-controles/' then
      raise exception 'url_photo_invalide' using errcode = '22023';
    end if;
  end loop;

  v_table := 'rapports_' || lower(p_secteur);

  -- Limite anti-abus globale : 1 200 transmissions par minute.
  select (select count(*) from public.rapports_lf where created_at > now() - interval '1 minute')
       + (select count(*) from public.rapports_nissan where created_at > now() - interval '1 minute')
       + (select count(*) from public.rapports_st where created_at > now() - interval '1 minute')
    into v_nombre;
  if v_nombre >= 1200 then
    raise exception 'limite_globale' using errcode = 'P0001';
  end if;

  insert into public.rapporteurs as r (nom, prenom)
  values (btrim(p_nom), btrim(p_prenom))
  on conflict (lower(nom), lower(prenom)) do update set nom = r.nom
  returning r.id into v_rapporteur;

  -- Limite individuelle : 5 contrôles par minute et par rapporteur.
  execute format(
    'select count(*) from public.%I where rapporteur_id = $1
       and created_at > now() - interval ''1 minute''', v_table)
    into v_nombre using v_rapporteur;
  if v_nombre >= 5 then
    raise exception 'limite_individuelle' using errcode = 'P0001';
  end if;

  execute format(
    'insert into public.%I (rapporteur_id, unite, emplacement, %s, remarques, photos, photos_urls)
     values ($1, $2, $3, %s, $5, $6, $7) returning id, created_at',
    v_table,
    (select string_agg(quote_ident(t.c), ', ' order by t.o) from unnest(v_cles) with ordinality as t (c, o)),
    (select string_agg(format('$4->>%L', t.c), ', ' order by t.o) from unnest(v_cles) with ordinality as t (c, o)))
    into rapport_id, recu_le
    using v_rapporteur, btrim(p_unite), btrim(p_emplacement), p_reponses,
          nullif(btrim(coalesce(p_remarques, '')), ''), to_jsonb(v_urls), v_urls;

  return next;
end;
$$;

revoke execute on function public.inserer_rapport(text, text, text, text, text, jsonb, text, text[], jsonb)
  from public, authenticated;
grant execute on function public.inserer_rapport(text, text, text, text, text, jsonb, text, text[], jsonb)
  to anon, service_role;

notify pgrst, 'reload schema';

-- 5) Vérification ------------------------------------------------------------
select
  to_regprocedure('public.inserer_rapport(text,text,text,text,text,jsonb,text,text[],jsonb)') is not null
    as fonction_photos_ok,
  exists (select 1 from storage.buckets where id = 'photos-controles') as bucket_ok,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'rapports_lf' and column_name = 'photos_urls'
  ) as colonne_photos_urls_ok;
