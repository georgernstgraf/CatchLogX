import { prisma } from "@/lib/prisma";

type RiverSiteRow = {
  id: number;
  siteCode: string;
  riverName: string;
  siteName?: string;
  landmarkUp?: string;
  latitude?: number;
  longitude?: number;
  landmarkDown?: string;
  latDown?: number;
  longDown?: number;
  localityLength?: number;
  localityWidth?: number;
};

const RIVER_SITES: RiverSiteRow[] = [
  {
    id: 1,
    siteCode: "DON001",
    riverName: "Donau",
    siteName: "Wien Stadtgebiet",
    landmarkUp: "Reichsbrücke",
    latitude: 48.2012,
    longitude: 16.4099,
    landmarkDown: "Praterbrücke",
    latDown: 48.1987,
    longDown: 16.4145,
    localityLength: 500.0,
    localityWidth: 15.0,
  },
  {
    id: 2,
    siteCode: "DON002",
    riverName: "Donau",
    siteName: "Krems",
    landmarkUp: "Kraftwerk Dürnstein",
    latitude: 48.4102,
    longitude: 15.6089,
    landmarkDown: "Eisenbahnbrücke Krems",
    latDown: 48.4087,
    longDown: 15.6123,
    localityLength: 300.0,
    localityWidth: 20.0,
  },
  {
    id: 3,
    siteCode: "INN001",
    riverName: "Inn",
    siteName: "Innsbruck",
    landmarkUp: "Universitätsbrücke",
    latitude: 47.2692,
    longitude: 11.4041,
    landmarkDown: "Alte Innbrücke",
    latDown: 47.2681,
    longDown: 11.4052,
    localityLength: 250.0,
    localityWidth: 8.0,
  },
  {
    id: 4,
    siteCode: "ENS001",
    riverName: "Enns",
    siteName: "Steyr",
    landmarkUp: "Stadtbrücke Steyr",
    latitude: 48.0473,
    longitude: 14.4211,
    landmarkDown: "Wehranlage",
    latDown: 48.0461,
    longDown: 14.4198,
    localityLength: 180.0,
    localityWidth: 12.0,
  },
  {
    id: 5,
    siteCode: "SAL001",
    riverName: "Salzach",
    siteName: "Salzburg",
    landmarkUp: "Staatsbrücke",
    latitude: 47.8021,
    longitude: 13.0472,
    landmarkDown: "Makartsteg",
    latDown: 47.8009,
    longDown: 13.0445,
    localityLength: 200.0,
    localityWidth: 10.0,
  },
  {
    id: 6,
    siteCode: "TRA001",
    riverName: "Traun",
    siteName: "Gmunden",
    landmarkUp: "Traunkraftwerk",
    latitude: 47.9175,
    longitude: 13.7998,
    landmarkDown: "Seebrücke",
    latDown: 47.9163,
    longDown: 13.8012,
    localityLength: 150.0,
    localityWidth: 6.0,
  },
  {
    id: 7,
    siteCode: "KAM001",
    riverName: "Kamp",
    siteName: "Zwettl",
    landmarkUp: "Stadtbrücke Zwettl",
    latitude: 48.6045,
    longitude: 15.1662,
    landmarkDown: "Mühlenwehr",
    latDown: 48.6031,
    longDown: 15.1671,
    localityLength: 120.0,
    localityWidth: 4.0,
  },
  {
    id: 8,
    siteCode: "MUR001",
    riverName: "Mur",
    siteName: "Graz",
    landmarkUp: "Keplerbrücke",
    latitude: 47.0707,
    longitude: 15.4395,
    landmarkDown: "Radetzkybrücke",
    latDown: 47.0692,
    longDown: 15.4412,
    localityLength: 280.0,
    localityWidth: 14.0,
  },
  {
    id: 9,
    siteCode: "PIE001",
    riverName: "Pielach",
    siteName: "Loosdorf",
    landmarkUp: "Autobahnbrücke A1",
    latitude: 48.1234,
    longitude: 15.3789,
    landmarkDown: "Gemeindesteg",
    latDown: 48.1221,
    longDown: 15.3798,
    localityLength: 100.0,
    localityWidth: 3.5,
  },
  {
    id: 10,
    siteCode: "YBB001",
    riverName: "Ybbs",
    siteName: "Amstetten",
    landmarkUp: "B1 Brücke",
    latitude: 48.1223,
    longitude: 14.8721,
    landmarkDown: "Eisenbahnbrücke",
    latDown: 48.1209,
    longDown: 14.8735,
    localityLength: 160.0,
    localityWidth: 5.5,
  },
];

async function main() {
  console.log("🌊 Inserting river sites...");

  await Promise.all(
    RIVER_SITES.map((site) =>
      prisma.riverSite.upsert({
        where: { id: site.id },
        update: {
          siteCode: site.siteCode,
          riverName: site.riverName,
          siteName: site.siteName,
          landmarkUp: site.landmarkUp,
          latitude: site.latitude,
          longitude: site.longitude,
          landmarkDown: site.landmarkDown,
          latDown: site.latDown,
          longDown: site.longDown,
          localityLength: site.localityLength,
          localityWidth: site.localityWidth,
        },
        create: {
          id: site.id,
          siteCode: site.siteCode,
          riverName: site.riverName,
          siteName: site.siteName,
          landmarkUp: site.landmarkUp,
          latitude: site.latitude,
          longitude: site.longitude,
          landmarkDown: site.landmarkDown,
          latDown: site.latDown,
          longDown: site.longDown,
          localityLength: site.localityLength,
          localityWidth: site.localityWidth,
        },
      })
    )
  );

  console.log(
    `✅ Insert/Update completed for ${RIVER_SITES.length} river sites.`
  );
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
