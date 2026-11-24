/**
 * Listen control for a Quranic word quoted in a Qaida lesson.
 *
 * Fetches the ayah's word-by-word recordings through the app's own Quran API
 * (the same cached `quran.surah` query the reader uses) and plays the one file
 * that is this word, or renders nothing when there is no trustworthy file. It
 * is passed into QaidaCourse by the page rather than imported there, so the
 * course itself stays free of network code and can be tested on its own.
 */
import { Volume2 } from "lucide-react";
import type { QaidaArabicText } from "@shared/qaidaExercises";
import { trpc } from "@/lib/trpc";
import { useLetterAudio } from "@/hooks/useLetterAudio";
import { useLocale } from "@/contexts/LocaleContext";
import { qaidaQuranWordAudio, quranWordLocation } from "@/lib/qaidaQuranWordAudio";

export function QaidaQuranWordAudio({ subject }: { subject: QaidaArabicText }) {
  const { t } = useLocale();
  const player = useLetterAudio();
  const location = quranWordLocation(subject);
  const surahQuery = trpc.quran.surah.useQuery(
    { surah: location?.surah ?? 1 },
    { enabled: location !== null, staleTime: Infinity, gcTime: Infinity, retry: 1 },
  );
  const reference = qaidaQuranWordAudio(subject, surahQuery.data);
  if (!reference) return null;

  const src = reference.url;
  const state = player.playingSrc === src ? "is-playing" : player.loadingSrc === src ? "is-loading" : player.unavailableSrc === src ? "is-unavailable" : "";
  return (
    <>
      <button type="button" className={`course-audio ${state}`} onClick={() => void player.play(src)} aria-label={t("course.playAudio")}>
        <Volume2 size={18} aria-hidden="true" />{" "}
        {player.loadingSrc === src ? t("qaida.audioLoading") : player.unavailableSrc === src ? t("qaida.audioRetry") : t("course.playAudio")}
      </button>
      <p className="course-note">{t("course.quranWordNote")}</p>
    </>
  );
}
