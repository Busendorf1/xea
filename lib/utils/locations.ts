export interface StateData {
  name: string;
  cities: string[];
}

export const locationData: Record<string, StateData[]> = {
  Nigeria: [
    {
      name: "Abia",
      cities: ["Umuahia", "Aba", "Ohafia", "Arochukwu", "Bende"]
    },
    {
      name: "Adamawa",
      cities: ["Yola", "Mubi", "Numan", "Jimeta"]
    },
    {
      name: "Akwa Ibom",
      cities: ["Uyo", "Eket", "Ikot Ekpene", "Oron", "Ikot Abasi"]
    },
    {
      name: "Anambra",
      cities: ["Awka", "Onitsha", "Nnewi", "Ekwulobia", "Obosi"]
    },
    {
      name: "Bauchi",
      cities: ["Bauchi", "Azare", "Misau", "Jama'are"]
    },
    {
      name: "Bayelsa",
      cities: ["Yenagoa", "Brass", "Amassoma", "Ogbia"]
    },
    {
      name: "Benue",
      cities: ["Makurdi", "Otukpo", "Gboko", "Katsina-Ala"]
    },
    {
      name: "Borno",
      cities: ["Maiduguri", "Biu", "Bama", "Monguno"]
    },
    {
      name: "Cross River",
      cities: ["Calabar", "Ikom", "Ogoja", "Ugep"]
    },
    {
      name: "Delta",
      cities: ["Asaba", "Warri", "Sapele", "Ughelli", "Agbor"]
    },
    {
      name: "Ebonyi",
      cities: ["Abakaliki", "Afikpo", "Onueke"]
    },
    {
      name: "Edo",
      cities: ["Benin City", "Auchi", "Ekpoma", "Uromi"]
    },
    {
      name: "Ekiti",
      cities: ["Ado-Ekiti", "Ikere", "Oye", "Effon-Alaiye"]
    },
    {
      name: "Enugu",
      cities: ["Enugu", "Nsukka", "Oji River", "Agbani"]
    },
    {
      name: "Gombe",
      cities: ["Gombe", "Kaltungo", "Dukku", "Biu Road"]
    },
    {
      name: "Imo",
      cities: ["Owerri", "Orlu", "Okigwe", "Mgbidi"]
    },
    {
      name: "Jigawa",
      cities: ["Dutse", "Hadejia", "Gumel", "Birnin Kudu"]
    },
    {
      name: "Kaduna",
      cities: ["Kaduna", "Zaria", "Kafanchan", "Sabon Gari"]
    },
    {
      name: "Kano",
      cities: ["Kano Municipal", "Dala", "Fagge", "Gwale", "Tarauni", "Nassarawa"]
    },
    {
      name: "Katsina",
      cities: ["Katsina", "Daura", "Funtua", "Malumfashi"]
    },
    {
      name: "Kebbi",
      cities: ["Birnin Kebbi", "Argungu", "Yauri", "Zuru"]
    },
    {
      name: "Kogi",
      cities: ["Lokoja", "Okene", "Kabba", "Idah"]
    },
    {
      name: "Kwara",
      cities: ["Ilorin", "Offa", "Omu-Aran", "Lafiagi"]
    },
    {
      name: "Lagos",
      cities: ["Ikeja", "Lekki", "Surulere", "Victoria Island", "Yaba", "Epe", "Badagry", "Ikorodu", "Maryland", "Apapa", "Oshodi", "Alimosho"]
    },
    {
      name: "Nasarawa",
      cities: ["Lafia", "Karu", "Keffi", "Akwanga"]
    },
    {
      name: "Niger",
      cities: ["Minna", "Suleja", "Bida", "Kontagora"]
    },
    {
      name: "Ogun",
      cities: ["Abeokuta", "Ota", "Ijebu Ode", "Sagamu", "Ilaro"]
    },
    {
      name: "Ondo",
      cities: ["Akure", "Ondo", "Owo", "Ikare", "Okitipupa"]
    },
    {
      name: "Osun",
      cities: ["Osogbo", "Ile-Ife", "Ilesa", "Ede", "Ila Orangun"]
    },
    {
      name: "Oyo",
      cities: ["Ibadan", "Ogbomosho", "Oyo", "Saki", "Eruwa"]
    },
    {
      name: "Plateau",
      cities: ["Jos", "Bukuru", "Pankshin", "Shendam"]
    },
    {
      name: "Rivers",
      cities: ["Port Harcourt", "Obio-Akpor", "Bonny", "Eleme", "Oyigbo", "Ahoada"]
    },
    {
      name: "Sokoto",
      cities: ["Sokoto", "Wurno", "Tambuwal"]
    },
    {
      name: "Taraba",
      cities: ["Jalingo", "Wukari", "Bali", "Gashaka"]
    },
    {
      name: "Yobe",
      cities: ["Damaturu", "Gashua", "Potiskum", "Nguru"]
    },
    {
      name: "Zamfara",
      cities: ["Gusau", "Kaura Namoda", "Talata Mafara"]
    },
    {
      name: "FCT",
      cities: ["Abuja", "Garki", "Wuse", "Maitama", "Asokoro", "Gwarinpa", "Kubwa", "Gwagwalada"]
    }
  ],
  "United States": [
    {
      name: "California",
      cities: ["Los Angeles", "San Francisco", "San Diego", "San Jose", "Sacramento", "Oakland", "Fremont"]
    },
    {
      name: "New York",
      cities: ["New York City", "Buffalo", "Rochester", "Syracuse", "Albany", "Yonkers"]
    },
    {
      name: "Texas",
      cities: ["Houston", "Dallas", "Austin", "San Antonio", "Fort Worth", "El Paso", "Arlington"]
    },
    {
      name: "Florida",
      cities: ["Miami", "Orlando", "Tampa", "Jacksonville", "Tallahassee", "Fort Lauderdale", "St. Petersburg"]
    },
    {
      name: "Illinois",
      cities: ["Chicago", "Aurora", "Rockford", "Joliet", "Naperville", "Springfield"]
    }
  ],
  "United Kingdom": [
    {
      name: "England",
      cities: ["London", "Manchester", "Birmingham", "Leeds", "Liverpool", "Newcastle", "Sheffield", "Bristol"]
    },
    {
      name: "Scotland",
      cities: ["Edinburgh", "Glasgow", "Aberdeen", "Dundee", "Inverness", "Stirling"]
    },
    {
      name: "Wales",
      cities: ["Cardiff", "Swansea", "Newport", "St Davids", "Bangor"]
    },
    {
      name: "Northern Ireland",
      cities: ["Belfast", "Derry", "Lisburn", "Newry", "Armagh"]
    }
  ],
  "Canada": [
    {
      name: "Ontario",
      cities: ["Toronto", "Ottawa", "Mississauga", "Hamilton", "Brampton", "London", "Markham"]
    },
    {
      name: "Quebec",
      cities: ["Montreal", "Quebec City", "Laval", "Gatineau", "Longueuil", "Sherbrooke"]
    },
    {
      name: "British Columbia",
      cities: ["Vancouver", "Victoria", "Surrey", "Burnaby", "Richmond", "Kelowna"]
    },
    {
      name: "Alberta",
      cities: ["Calgary", "Edmonton", "Red Deer", "Lethbridge", "St. Albert"]
    }
  ],
  "Ghana": [
    {
      name: "Greater Accra",
      cities: ["Accra", "Tema", "Madina", "Ashaiman", "Dangme East"]
    },
    {
      name: "Ashanti",
      cities: ["Kumasi", "Obuasi", "Ejisu", "Konongo", "Mampong"]
    },
    {
      name: "Western",
      cities: ["Sekondi-Takoradi", "Tarkwa", "Axim", "Elubo"]
    },
    {
      name: "Eastern",
      cities: ["Koforidua", "Nkawkaw", "Akim Oda", "Suhum"]
    }
  ]
};

export const countryList = Object.keys(locationData);
