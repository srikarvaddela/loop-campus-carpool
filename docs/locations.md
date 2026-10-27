# Location suggestions

Search and the post/edit ride form share a curated local catalog in `lib/locations.ts`. No API key or external places service is needed, and typing a location does not send a request to a third party. Users may also keep any custom location.

Names, building codes, common aliases, and words in different orders are searchable. Picking a suggestion stores the same short location text in both forms (for example `ECSW` or `DFW Airport`). This preserves compatibility with existing text-based ride search; it does not change historical records or claim that different free-text descriptions identify the same pickup point.

These are buildings, destinations, or neighborhoods, not verified roadside pickup zones. Drivers and riders should agree on the specific meeting point in trip messages. Airport suggestions do not select a terminal.

Catalog references checked October 27, 2026:

- [UT Dallas campus map](https://housing.utdallas.edu/files/2023/06/campus-map.pdf) and [Facilities building directory](https://facilities.utdallas.edu/contact/): major academic and student buildings.
- [Visit Dallas transportation](https://www.visitdallas.com/plan/transportation/): DFW, Love Field, Union Station, and American Airlines Center.
- [Visit Dallas shopping](https://www.visitdallas.com/things-to-do/shopping/): NorthPark, Galleria, and Mockingbird Station.
- [Visit Dallas neighborhoods](https://www.visitdallas.com/neighborhoods/) and [things to do](https://www.visitdallas.com/things-to-do/): Dallas districts, museums, parks, and landmarks.

Add or update catalog entries without changing database schema. Prefer recognizable names and specific aliases; avoid broad aliases that imply a precise pickup address.
