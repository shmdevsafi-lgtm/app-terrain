import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useRapport } from "../context/RapportContext";
import { Entete, EnTetePage, Note } from "../components/Chrome";

const SECTEURS = ["LF", "NISSAN", "ST"] as const;
type Secteur = (typeof SECTEURS)[number];

const DESCRIPTIONS: Record<Secteur, string> = {
  LF: "Ligne F",
  NISSAN: "Atelier de traitement",
  ST: "Stockage",
};

const LOGOS: Record<Secteur, { src: string; alt: string }> = {
  LF: { src: "/secteur-lf.png", alt: "Logo Ligne F" },
  NISSAN: { src: "/secteur-nissan.png", alt: "Logo Atelier de traitement Nissan" },
  ST: { src: "/secteur-stockage.png", alt: "Logo Stockage" },
};

export default function PageSecteur() {
  const navigate = useNavigate();
  const { etat, maj, referentiel } = useRapport();

  const secteurs = useMemo(
    () =>
      SECTEURS.map((code) => {
        const lieux = referentiel?.lieux.filter((lieu) => lieu.secteur === code);
        return {
          code,
          unites: lieux ? new Set(lieux.map((lieu) => lieu.unite)).size : null,
          emplacements: lieux?.length ?? null,
        };
      }),
    [referentiel],
  );

  function choisir(code: Secteur) {
    if (etat.secteur !== code) {
      maj({ secteur: code, unite: "", emplacement: "", reponses: {}, remarques: "" });
    }
    navigate("/rapport/identification");
  }

  const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? "s" : ""}`;

  return (
    <div className="min-h-screen pb-12">
      <Entete etape={1} />

      <main className="mx-auto w-full max-w-xl px-5">
        <EnTetePage
          surtitre="Contrôle terrain · départ"
          titre="Choisir un secteur"
          description="Sélectionnez la zone où vous effectuez le contrôle. Vous pourrez changer de secteur à tout moment."
        />

        {referentiel.lieux.length === 0 && (
          <p role="alert" className="mt-6 border border-ambre/40 bg-ambre/[0.07] p-4 text-[12px] leading-5 text-ambre">
            Le référentiel des emplacements est vide. Contactez le responsable du site avant de continuer.
          </p>
        )}

        <ul className="monter d1 mt-7 grid gap-3">
          {secteurs.map((s, index) => {
            const actif = etat.secteur === s.code;
            return (
              <li key={s.code}>
                <button
                  type="button"
                  onClick={() => choisir(s.code)}
                  aria-current={actif ? "true" : undefined}
                  className={`group relative flex min-h-[112px] w-full items-center gap-4 overflow-hidden rounded-md border bg-white px-4 py-4 text-left transition ${
                    actif
                      ? "border-pin shadow-[0_0_0_1px_rgba(29,107,61,0.35)]"
                      : "border-sable hover:-translate-y-px hover:border-pin/45 hover:shadow-[0_18px_34px_-30px_rgba(15,35,31,0.45)]"
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`absolute left-0 top-0 h-full w-[3px] ${actif ? "bg-pin" : "bg-pin/20"}`}
                  />

                  <span
                    className={`relative z-10 grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-md border bg-white ${
                      actif ? "border-pin/50" : "border-sable"
                    }`}
                  >
                    <img
                      src={LOGOS[s.code].src}
                      alt={LOGOS[s.code].alt}
                      className="h-full w-full object-contain"
                      loading="lazy"
                      width={64}
                      height={64}
                    />
                  </span>

                  <span className="relative z-10 min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                      <span className={`display text-[1.7rem] leading-none ${actif ? "text-pin" : "text-encre"}`}>
                        {s.code}
                      </span>
                      <span className="text-[10px] uppercase tracking-[0.12em] text-acier">
                        {DESCRIPTIONS[s.code]}
                      </span>
                    </span>
                    <span className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-acier">
                      {s.unites !== null && s.emplacements !== null ? (
                        <>
                          <span className="mono">{pluriel(s.unites, "unité")}</span>
                          <span className="text-sable">·</span>
                          <span className="mono">{pluriel(s.emplacements, "emplacement")}</span>
                        </>
                      ) : (
                        <span>Référentiel indisponible</span>
                      )}
                    </span>
                  </span>

                  <span
                    aria-hidden="true"
                    className={`relative z-10 grid h-9 w-9 shrink-0 place-items-center rounded-full border transition ${
                      actif
                        ? "border-pin bg-pin text-white"
                        : "border-sable text-pin group-hover:border-pin group-hover:text-pin"
                    }`}
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
                      <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="square" />
                    </svg>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <div className="monter d2 mt-6">
          <Note>
            Aucun compte n'est nécessaire. Vos réponses sont transmises au serveur à la fin du contrôle et restent
            consultables par la supervision.
          </Note>
        </div>

        <div className="monter d3 mt-8 flex items-center justify-between border-t border-sable/80 pt-4">
          <span className="etiquette text-[8px] text-acier">Douches de sécurité · v3</span>
          <span className="etiquette text-[8px] text-acier/70">Étape 1 / 3</span>
        </div>
      </main>
    </div>
  );
}
