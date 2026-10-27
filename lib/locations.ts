export type Place = {
  value: string;
  name: string;
  area: string;
  kind: "campus" | "airport" | "city";
  aliases: string[];
};

// Curated suggestions, not geocoded pickup points. Sources: docs/locations.md.
export const places: Place[] = [
  { value: "ECSW", name: "Engineering and Computer Science West", area: "UT Dallas · ECSW", kind: "campus", aliases: ["ecs west", "engineering west"] },
  { value: "ECSN", name: "Engineering and Computer Science North", area: "UT Dallas · ECSN", kind: "campus", aliases: ["ecs north", "engineering north"] },
  { value: "ECSS", name: "Engineering and Computer Science South", area: "UT Dallas · ECSS", kind: "campus", aliases: ["ecs south", "engineering south"] },
  { value: "Student Union", name: "Student Union", area: "UT Dallas · SU", kind: "campus", aliases: ["su", "union"] },
  { value: "McDermott Library", name: "Eugene McDermott Library", area: "UT Dallas · MC", kind: "campus", aliases: ["mc", "library", "eugene mcdermott"] },
  { value: "JSOM", name: "Naveen Jindal School of Management", area: "UT Dallas · JSOM", kind: "campus", aliases: ["jindal", "business school", "management"] },
  { value: "Activity Center", name: "Activity Center", area: "UT Dallas · AB", kind: "campus", aliases: ["ab", "gym", "recreation"] },
  { value: "ATC", name: "Edith O’Donnell Arts and Technology Building", area: "UT Dallas · ATC", kind: "campus", aliases: ["atec", "arts and tech", "odonnell"] },
  { value: "Sciences Building", name: "Sciences Building", area: "UT Dallas · SCI", kind: "campus", aliases: ["sci", "science building"] },
  { value: "SLC", name: "Science Learning Center", area: "UT Dallas · SLC", kind: "campus", aliases: ["science learning"] },
  { value: "BSB", name: "Bioengineering and Sciences Building", area: "UT Dallas · BSB", kind: "campus", aliases: ["bioengineering", "biosciences"] },
  { value: "Founders Building", name: "Founders Building", area: "UT Dallas · FO", kind: "campus", aliases: ["fo", "founders"] },
  { value: "Founders North", name: "Founders North", area: "UT Dallas · FN", kind: "campus", aliases: ["fn"] },
  { value: "Green Hall", name: "Cecil H. Green Hall", area: "UT Dallas · GR", kind: "campus", aliases: ["gr", "cecil green"] },
  { value: "Jonsson Academic Center", name: "Erik Jonsson Academic Center", area: "UT Dallas · JO", kind: "campus", aliases: ["jo", "jonsson"] },
  { value: "Davidson-Gundy Alumni Center", name: "Davidson-Gundy Alumni Center", area: "UT Dallas · DGA", kind: "campus", aliases: ["dga", "alumni"] },
  { value: "Visitor Center", name: "Visitor Center and University Bookstore", area: "UT Dallas · VCB", kind: "campus", aliases: ["vcb", "bookstore", "visitor"] },
  { value: "DFW Airport", name: "Dallas Fort Worth International Airport", area: "DFW · Airport", kind: "airport", aliases: ["dfw", "dallas airport", "fort worth airport", "international airport"] },
  { value: "Dallas Love Field Airport", name: "Dallas Love Field Airport", area: "Dallas · DAL", kind: "airport", aliases: ["dal", "love field", "southwest airport"] },
  { value: "Downtown Dallas", name: "Downtown Dallas", area: "Dallas · Neighborhood", kind: "city", aliases: ["downtown", "city center"] },
  { value: "Deep Ellum", name: "Deep Ellum", area: "Dallas · Neighborhood", kind: "city", aliases: ["deepellum"] },
  { value: "Uptown Dallas", name: "Uptown Dallas", area: "Dallas · Neighborhood", kind: "city", aliases: ["uptown"] },
  { value: "Bishop Arts District", name: "Bishop Arts District", area: "Dallas · Neighborhood", kind: "city", aliases: ["bishop arts", "oak cliff"] },
  { value: "NorthPark Center", name: "NorthPark Center", area: "Dallas · Shopping", kind: "city", aliases: ["northpark", "north park", "mall"] },
  { value: "Galleria Dallas", name: "Galleria Dallas", area: "Dallas · Shopping", kind: "city", aliases: ["galleria", "mall"] },
  { value: "Mockingbird Station", name: "Mockingbird Station", area: "Dallas · Shopping & transit", kind: "city", aliases: ["smu mockingbird", "dart mockingbird"] },
  { value: "Dallas Union Station", name: "Eddie Bernice Johnson Union Station", area: "Downtown Dallas · Transit", kind: "city", aliases: ["union station", "ebj", "amtrak", "train station"] },
  { value: "American Airlines Center", name: "American Airlines Center", area: "Dallas · Arena", kind: "city", aliases: ["aac", "mavericks", "mavs", "stars", "arena"] },
  { value: "Klyde Warren Park", name: "Klyde Warren Park", area: "Dallas · Park", kind: "city", aliases: ["klyde", "warren park"] },
  { value: "Dallas Farmers Market", name: "Dallas Farmers Market", area: "Dallas · Market", kind: "city", aliases: ["farmers market", "farmers"] },
  { value: "Reunion Tower", name: "Reunion Tower", area: "Downtown Dallas · Landmark", kind: "city", aliases: ["reunion", "geo deck"] },
  { value: "Perot Museum", name: "Perot Museum of Nature and Science", area: "Dallas · Museum", kind: "city", aliases: ["perot", "nature science museum"] },
  { value: "Dallas Museum of Art", name: "Dallas Museum of Art", area: "Dallas Arts District · Museum", kind: "city", aliases: ["dma", "art museum"] },
  { value: "Dallas Arboretum", name: "Dallas Arboretum and Botanical Garden", area: "East Dallas · Garden", kind: "city", aliases: ["arboretum", "botanical garden"] },
];

const normalize = (text: string) => text.toLowerCase().normalize("NFKD").replace(/[’']/g, "").replace(/[^a-z0-9]+/g, " ").trim();

export function suggestPlaces(query: string, preference: "pickup" | "destination", limit = 7): Place[] {
  const q = normalize(query);
  const words = q.split(" ");
  return places.map((place, index) => {
    const terms = [place.value, place.name, ...place.aliases].map(normalize);
    const searchable = normalize([place.name, place.value, place.area, ...place.aliases].join(" "));
    const score = !q ? 0 : terms.some((term) => term === q) ? 100 : terms.some((term) => term.startsWith(q)) ? 80 : words.every((word) => searchable.includes(word)) ? 40 : -1;
    const preferred = preference === "pickup" ? place.kind === "campus" : place.kind !== "campus";
    return { place, index, score: score < 0 ? -1 : score + (preferred ? 5 : 0) };
  }).filter(({ score }) => score >= 0).sort((a, b) => b.score - a.score || a.index - b.index).slice(0, limit).map(({ place }) => place);
}
