-- Sacrament guides for the public "Mga Sakramento" section: adds an OCIA
-- guide (Order of Christian Initiation of Adults) and fills the Baptism,
-- Wedding and OCIA guides with the usual requirements in Philippine parishes,
-- in Bisaya. They stay drafts: staff check them against the parish and
-- diocese's own rules in Parish Website → Sacraments, add the schedule and
-- fees, then publish. A guide staff have already written is left alone.
-- Run after 0011_website_content.sql. Safe to re-run.

do $$
begin
  if to_regclass('public.sacrament_guides') is null then
    raise exception 'Run 0011_website_content.sql before this migration';
  end if;
end;
$$;

insert into sacrament_guides (key, title, sort) values
  ('ocia', 'OCIA (Pagkahimong Katoliko sa mga Hamtong)', 7)
on conflict (key) do nothing;

-- Only guides with nothing written yet.
update sacrament_guides set
  summary = 'Para sa mga bata. Duol sa opisina sa parokya labing menos duha ka semana una sa gusto ninyong petsa. Ang mga hamtong nga wala pa mabunyagi moagi sa OCIA.',
  steps = $j$[
    {"title": "Magpalista sa opisina sa parokya", "detail": "Dad-a ang mga dokumento ug pilia ang petsa sa bunyag."},
    {"title": "Mosalmot sa seminar una sa bunyag", "detail": "Ang ginikanan ug ang mga maninoy ug maninay. Kasagaran sa semana una sa bunyag."},
    {"title": "Ang Bunyag", "detail": "Moabot 30 minutos una sa oras, uban sa mga maninoy ug maninay."},
    {"title": "Kuhaa ang sertipiko sa bunyag", "detail": "Mahimong pangayoon dinhi sa website: Mga Serbisyo → Pangayo og sertipiko."}
  ]$j$::jsonb,
  requirements = $j$[
    "PSA birth certificate sa bata (photocopy)",
    "Marriage certificate sa ginikanan (sa simbahan o civil), kung minyo",
    "Mga ngalan ug address sa mga maninoy ug maninay",
    "Ang mga maninoy ug maninay: Katoliko, nakumpilan, 16 anyos pataas, ug nagpuyo sa pagtuo",
    "Sertipiko sa seminar, kung sa laing parokya nag-seminar",
    "Permiso gikan sa inyong parokya, kung dili kamo sakop niini nga parokya"
  ]$j$::jsonb,
  notes = 'Usahay gipangayo usab ang sertipiko sa kumpil sa mga maninoy ug maninay. Palihug kumpirmaha sa opisina ang eksaktong mga kinahanglanon.'
where key = 'baptism' and coalesce(summary, '') = '' and steps = '[]'::jsonb and requirements = '[]'::jsonb;

update sacrament_guides set
  summary = 'Para sa magtiayon nga gusto magpakasal sa Simbahang Katoliko. Duol sa opisina sa parokya labing menos tulo ka bulan una sa petsa sa kasal.',
  steps = $j$[
    {"title": "Magpa-iskedyul sa opisina sa parokya", "detail": "Pilia ang petsa sa kasal ug magpalista para sa interbyu."},
    {"title": "Pre-Cana seminar", "detail": "Ang pagpangandam sa kaminyoon alang sa magtiayon."},
    {"title": "Canonical interview uban sa pari", "detail": "Ang magtiayon tagsa-tagsa ug duha mohatag og tubag sa mga pangutana sa pari."},
    {"title": "Pagpahibalo (marriage banns)", "detail": "Ipahibalo sa simbahan sulod sa tulo ka Domingo una sa kasal."},
    {"title": "Marriage license", "detail": "Gikan sa Local Civil Registrar sa munisipyo o siyudad. Kung lima ka tuig na kamong nag-uban, affidavit of cohabitation (Article 34) ang ilisan niini."},
    {"title": "Ang Kasal", "detail": "Kumpirmaha sa opisina ang oras ug ang mga ninong ug ninang."}
  ]$j$::jsonb,
  requirements = $j$[
    "Baptismal certificate (for marriage purposes) sa duha, bag-o nga gi-isyu sulod sa 6 ka bulan",
    "Confirmation certificate sa duha",
    "PSA birth certificate sa duha",
    "PSA CENOMAR (Certificate of No Marriage) sa duha",
    "Marriage license, o affidavit of cohabitation (Article 34)",
    "Sertipiko sa Pre-Cana seminar",
    "2x2 nga litrato sa matag usa",
    "Mga ngalan sa mga ninong ug ninang",
    "Permiso gikan sa parokya sa pangasaw-onon o pamanhonon, kung lahi ang parokya",
    "Kung balo: death certificate sa nauna nga kapikas"
  ]$j$::jsonb,
  notes = 'Ang mga sertipiko gikan sa simbahan kuhaon sa parokya diin kamo gibunyagan ug gikumpilan. Palihug kumpirmaha sa opisina ang eksaktong mga kinahanglanon.'
where key = 'wedding' and coalesce(summary, '') = '' and steps = '[]'::jsonb and requirements = '[]'::jsonb;

update sacrament_guides set
  summary = 'Order of Christian Initiation of Adults: para sa mga hamtong nga wala pa mabunyagi, sa mga nabunyagan sa laing Kristohanong simbahan nga gusto mahimong Katoliko, ug sa mga Katoliko nga hamtong nga wala pa makadawat sa Unang Kalawat o Kumpil.',
  steps = $j$[
    {"title": "Pagpangutana (Inquiry)", "detail": "Makigsulti sa opisina o sa pari. Ipaila ang imong kaugalingon ug ipangutana ang gusto nimong mahibal-an."},
    {"title": "Rito sa Pagdawat", "detail": "Ang pagsugod isip katekumeno uban sa imong sponsor."},
    {"title": "Katekumenado", "detail": "Regular nga klase sa pagtuo, kasagaran sulod sa pipila ka bulan."},
    {"title": "Rito sa Pagpili", "detail": "Kasagaran sa unang Domingo sa Kwaresma."},
    {"title": "Pagputli ug Paglamdag", "detail": "Panahon sa pag-ampo ug pagpangandam sulod sa Kwaresma."},
    {"title": "Pagdawat sa mga sakramento", "detail": "Bunyag, Kumpil ug Unang Kalawat, kasagaran sa Easter Vigil."},
    {"title": "Mistagogia", "detail": "Padayon nga pagtuon ug pag-apil sa parokya human sa Pasko sa Pagkabanhaw."}
  ]$j$::jsonb,
  requirements = $j$[
    "PSA birth certificate",
    "Baptismal certificate, kung nabunyagan na sa laing simbahan",
    "Usa ka sponsor: Katoliko, nakumpilan, ug nagpuyo sa pagtuo",
    "Marriage certificate, kung minyo",
    "2x2 nga litrato"
  ]$j$::jsonb,
  notes = 'Ang iskedyul sa klase gitino sa parokya. Duol sa opisina aron mahibal-an kanus-a magsugod ang sunod nga grupo.'
where key = 'ocia' and coalesce(summary, '') = '' and steps = '[]'::jsonb and requirements = '[]'::jsonb;
