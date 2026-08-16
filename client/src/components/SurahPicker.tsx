/**
 * Surah picker showing each surah's Arabic name with its transliteration.
 *
 * This is a listbox rather than a native `<select>` for one reason: an
 * `<option>` can hold only a single run of plain text, so it cannot set Amiri on
 * the Arabic name or stack the transliteration beneath it. Everything a native
 * select gave us — type-to-search over 114 items, keyboard navigation, escape to
 * close — comes back from Command inside a Popover, and search here also matches
 * the Arabic name and the surah number.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useLocale } from "@/contexts/LocaleContext";
import type { SurahSummary } from "@shared/quran";

type SurahPickerProps = {
  surahs: SurahSummary[];
  value: number;
  onSelect: (surah: number) => void;
};

export function SurahPicker({ surahs, value, onSelect }: SurahPickerProps) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const selected = surahs.find((surah) => surah.number === value) ?? null;
  const itemRefs = useRef(new Map<number, HTMLDivElement>());

  // Open on the surah being read rather than at the top of the list.
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      itemRefs.current.get(value)?.scrollIntoView({ block: "center" });
    });
    return () => cancelAnimationFrame(frame);
  }, [open, value]);

  const searchable = useMemo(() => new Map(
    surahs.map((surah) => [
      surah.number,
      `${surah.number} ${surah.nameSimple} ${surah.nameArabic} ${surah.translatedName}`,
    ]),
  ), [surahs]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="surah-trigger" aria-label={t("reader.surahLabel")} disabled={!surahs.length}>
          {selected ? (
            <span className="surah-names">
              <span className="surah-arabic" lang="ar" dir="rtl">{selected.nameArabic}</span>
              <small>{selected.number}. {selected.nameSimple}</small>
            </span>
          ) : <span className="surah-names"><small>{t("reader.loadingSurahs")}</small></span>}
          <ChevronDown size={14} aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="surah-popover" align="start" sideOffset={6}>
        <Command loop>
          <CommandInput placeholder={t("reader.surahSearch")} />
          <CommandList>
            <CommandEmpty>{t("reader.surahNoMatch")}</CommandEmpty>
            <CommandGroup>
              {surahs.map((surah) => (
                <CommandItem
                  key={surah.number}
                  value={searchable.get(surah.number)}
                  onSelect={() => { onSelect(surah.number); setOpen(false); }}
                  ref={(node) => {
                    if (node) itemRefs.current.set(surah.number, node);
                    else itemRefs.current.delete(surah.number);
                  }}
                >
                  <span className="surah-option-number">{surah.number}</span>
                  <span className="surah-option-names">
                    {/* Arabic first and largest: it is the surah's own name, and
                        the transliteration underneath is the aid to reading it. */}
                    <span className="surah-arabic" lang="ar" dir="rtl">{surah.nameArabic}</span>
                    <small>{surah.nameSimple} · {surah.translatedName}</small>
                  </span>
                  {surah.number === value && <Check size={14} className="surah-option-check" />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
