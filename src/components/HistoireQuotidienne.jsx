import { useState, useEffect } from "react";
import { TONES } from "../lib/histoireQuotidienne";

export default function HistoireQuotidienne({ histoire, onFermer }) {
  const [indexActuel, setIndexActuel] = useState(0);
  const [lignesAffichees, setLignesAffichees] = useState(0);

  const slide = histoire?.histoires?.[indexActuel];
  const tone = slide ? TONES[slide.tone] || TONES.info : TONES.info;
  const totalSlides = histoire?.histoires?.length || 1;
  const progression = histoire?.histoires?.length
    ? (indexActuel + 1) / totalSlides
    : 0;

  useEffect(() => {
    setLignesAffichees(0);
    if (!slide?.lignes?.length) return;
    let i = 0;
    const t = setInterval(() => {
      i++;
      setLignesAffichees(i);
      if (i >= slide.lignes.length) clearInterval(t);
    }, 350);
    return () => clearInterval(t);
  }, [indexActuel, slide]);

  if (!histoire || !slide) return null;

  const allerSuivant = (e) => {
    e?.stopPropagation?.();
    if (indexActuel < totalSlides - 1) {
      setIndexActuel(indexActuel + 1);
    } else {
      onFermer?.();
    }
  };

  const allerPrecedent = (e) => {
    e?.stopPropagation?.();
    if (indexActuel > 0) setIndexActuel(indexActuel - 1);
  };

  return (
    <div className="w-full max-w-3xl mx-auto select-none">
      <div className="flex gap-1 mb-3 items-center justify-between">
        <div className="flex gap-1.5 flex-1">
          {histoire.histoires.map((_, i) => (
            <div
              key={i}
              className="h-1 flex-1 rounded-full overflow-hidden bg-white/20">
              <div
                className="h-full bg-white transition-all duration-300"
                style={{
                  width:
                    i < indexActuel ? "100%" :
                    i === indexActuel ? `${progression * 100}%` : "0%",
                }}
              />
            </div>
          ))}
        </div>
        <button
          onClick={onFermer}
          className="ml-3 text-white/80 hover:text-white text-2xl leading-none font-bold px-2 -mt-0.5"
          title="Fermer">
          ×
        </button>
      </div>

      <div
        className={`relative rounded-2xl overflow-hidden shadow-2xl bg-gradient-to-br ${tone.bg} ${tone.text} cursor-pointer`}
        onClick={allerSuivant}
      >
        <div className="absolute inset-0 opacity-[0.06] pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 10%, white, transparent 40%)",
          }}
        />

        <div className="relative p-6 sm:p-7 min-h-[260px] flex flex-col justify-between">
          <div className="flex items-start gap-4 mb-5">
            <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-3xl shadow-lg border border-white/30">
              {slide.icon}
            </div>
            <div className="flex-1">
              <div className="text-[11px] font-bold uppercase tracking-widest opacity-70 mb-1">
                {indexActuel + 1} / {totalSlides} · {(slide.type || "STORY").toUpperCase()}
              </div>
              <h2 className="text-2xl sm:text-3xl font-black leading-tight tracking-tight drop-shadow-sm">
                {slide.titre}
              </h2>
            </div>
          </div>

          <div className="space-y-3 my-auto py-2">
            {(slide.lignes || []).slice(0, lignesAffichees).map((ligne, idx) => (
              <div
                key={idx}
                className="text-base sm:text-lg leading-relaxed opacity-0 font-medium text-white/95 whitespace-pre-line"
                style={{
                  textShadow: "0 1px 2px rgba(0,0,0,0.15)",
                  animation: `fadeSlide .35s ease-out ${idx * 20}ms forwards`,
                }}
                dangerouslySetInnerHTML={{
                  __html: ligne
                    .replace(/\*\*(.+?)\*\*/g, '<span class="font-black text-white">$1</span>')
                    .replace(/\*(.+?)\*/g, '<span class="italic opacity-90">$1</span>'),
                }}
              />
            ))}
          </div>

          <div className="flex items-center justify-between pt-5 mt-4 text-sm opacity-80">
            <button
              onClick={allerPrecedent}
              className={`px-4 py-2 rounded-xl bg-white/15 hover:bg-white/25 backdrop-blur-sm font-bold transition-all ${indexActuel === 0 ? "opacity-20 pointer-events-none" : ""}`}>
              ← Préc.
            </button>
            <div className="text-xs font-bold tracking-wide">
              {histoire.stationNom} · {new Date(histoire.dateISO).toLocaleDateString("fr-FR")}
            </div>
            <button
              onClick={allerSuivant}
              className="px-4 py-2 rounded-xl bg-white/15 hover:bg-white/25 backdrop-blur-sm font-bold transition-all">
              {indexActuel === totalSlides - 1 ? "Terminé ✓" : "Suivant →"}
            </button>
          </div>
        </div>
      </div>

      {histoire.alertes && histoire.alertes.length > 0 && indexActuel === totalSlides - 1 && (
        <div className="mt-4 p-4 rounded-2xl bg-white border-2 border-rose-200 shadow-md">
          <h3 className="font-black text-rose-700 mb-3 flex items-center gap-2">
            🚨 Points d'attention ({histoire.alertes.length})
          </h3>
          <ul className="space-y-2">
            {histoire.alertes.map((a) => (
              <li key={a.id} className="flex gap-3 items-start p-2 rounded-xl bg-rose-50/60">
                <span className="text-xl">{a.icon}</span>
                <span className="text-sm font-medium text-slate-800">{a.msg}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <style>{`
        @keyframes fadeSlide {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
