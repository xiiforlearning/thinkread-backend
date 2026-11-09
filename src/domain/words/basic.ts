/**
 * The most basic English vocabulary (roughly Oxford A1): words a student of this school knows
 * long before they start reporting. They are not added to the dictionary automatically from a
 * report (teacher's feedback 02.11.2026, W6) — the student can still tick them on the
 * confirmation screen or add them by hand. The AI marks A1 words too; this list is the
 * rule-based twin for the fake adapter and the model-outage fallback.
 */
const BASIC = `
a about after again all also always and animal answer any apple arm ask at aunt away baby back bad
bag ball banana bath be beautiful because bed bedroom before begin behind best big bike bird
birthday black blue boat body book boot bottle box boy bread break breakfast bring brother brown
build bus busy but buy by cake call camera can car card carry cat chair change cheap chicken child
children city class clean clock close clothes coffee cold color colour come computer cook cool
country cup dad dance dark daughter day dear desk dinner dirty do doctor dog door down draw dress
drink drive early eat egg eight eighteen eighty eleven end evening every eye face fall family far
fast father favourite favorite feel fifteen fifty film find fine finish fire first fish five floor
flower fly food foot football for forty four fourteen free friend from fruit full fun game garden
get girl give glass go good goodbye grandfather grandmother great green grey gray ground hair half
hand happy hard hat have he head hear hello help her here hi high him his hobby holiday home
homework horse hospital hot hour house how hundred hungry husband i ice idea in interesting it job
juice jump keep key kind kitchen know language large last late learn left leg lesson letter like
listen little live long look lot love lunch make man many map market me meat meet milk minute
money month morning mother mountain mouse mouth move much mum music my name near need never new
next nice night nine nineteen ninety no nose not now number of office often old on one open or
orange our out over page paint paper parent park party pen pencil people person phone photo
picture pink place plane play please police poor potato put question quick quiet rain read red
rice ride right river road room run sad salt same say school sea second see sell seven seventeen
seventy she shirt shoe shop short show shower sing sister sit six sixteen sixty sky sleep slow
small snow so sock some son song sorry speak sport stand star start stop street strong student
study sugar summer sun swim table take talk tall tea teacher tell ten thank that the their them
then there these they thing think thirteen thirty this those thousand three time tired to today
tomorrow tonight too tooth town train tree trousers try turn twelve twenty two uncle under
understand up us use very visit wait wake walk wall want warm wash watch water we weather week
well what when where which white who why wife window winter with woman word work world write
year yellow yes yesterday you young your zoo
`;

export const BASIC_WORDS: ReadonlySet<string> = new Set(BASIC.split(/\s+/).filter(Boolean));

/** True for an A1 lemma (one word; phrases are never "basic"). */
export function isBasicWord(lemma: string): boolean {
  return BASIC_WORDS.has(lemma.trim().toLowerCase());
}
