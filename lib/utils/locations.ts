export interface StateData {
  name: string;
  cities: string[];
}

export const locationData: Record<string, StateData[]> = {
  Nigeria: [
    {
      name: "Abia",
      cities: ["Umuahia", "Aba North", "Aba South", "Ohafia", "Arochukwu", "Bende", "Isialangwa North", "Isialangwa South", "Ikwuano", "Obingwa", "Osisioma", "Ukwa East", "Ukwa West", "Ugwunagbo"]
    },
    {
      name: "Adamawa",
      cities: ["Yola North", "Yola South", "Mubi North", "Mubi South", "Numan", "Jimeta", "Ganye", "Michika", "Madagali", "Hong", "Song", "Demsa"]
    },
    {
      name: "Akwa Ibom",
      cities: ["Uyo", "Eket", "Ikot Ekpene", "Oron", "Ikot Abasi", "Abak", "Etinan", "Ibiono-Ibom", "Itu", "Onna", "Esit Eket", "Ibeno"]
    },
    {
      name: "Anambra",
      cities: ["Awka North", "Awka South", "Onitsha North", "Onitsha South", "Nnewi North", "Nnewi South", "Ekwulobia", "Aguata", "Anaocha", "Dunukofia", "Njikoka", "Ogbaru", "Oyi", "Ihiala", "Idemili North", "Idemili South", "Obosi"]
    },
    {
      name: "Bauchi",
      cities: ["Bauchi", "Azare", "Misau", "Jama'are", "Katagum", "Alkaleri", "Ningi", "Dass", "Toro"]
    },
    {
      name: "Bayelsa",
      cities: ["Yenagoa", "Brass", "Amassoma", "Ogbia", "Sagbama", "Ekeremor", "Nembe", "Kolokuma/Opokuma"]
    },
    {
      name: "Benue",
      cities: ["Makurdi", "Otukpo", "Gboko", "Katsina-Ala", "Vandeikya", "Ukum", "Buruku", "Guma", "Tarka"]
    },
    {
      name: "Borno",
      cities: ["Maiduguri", "Biu", "Bama", "Monguno", "Gwoza", "Dikwa", "Askira/Uba", "Damboa", "Kaga", "Konduga"]
    },
    {
      name: "Cross River",
      cities: ["Calabar Municipal", "Calabar South", "Ikom", "Ogoja", "Ugep", "Obudu", "Akpabuyo", "Bekwarra", "Yala"]
    },
    {
      name: "Delta",
      cities: ["Asaba", "Warri North", "Warri South", "Warri Southwest", "Sapele", "Ughelli North", "Ughelli South", "Agbor", "Uvwie", "Okpe", "Ika South", "Ndokwa East", "Ndokwa West"]
    },
    {
      name: "Ebonyi",
      cities: ["Abakaliki", "Afikpo North", "Afikpo South", "Onueke", "Ezza North", "Ezza South", "Ikwo", "Izzi", "Ohaozara"]
    },
    {
      name: "Edo",
      cities: ["Benin City", "Oredo", "Ikpoba Okha", "Egor", "Auchi", "Ekpoma", "Uromi", "Esan Central", "Esan Northeast", "Esan Southeast", "Etsako West"]
    },
    {
      name: "Ekiti",
      cities: ["Ado-Ekiti", "Ikere", "Oye", "Effon-Alaiye", "Ikole", "Ijero", "Gbonyin", "Ekiti Southwest"]
    },
    {
      name: "Enugu",
      cities: ["Enugu North", "Enugu South", "Enugu East", "Nsukka", "Oji River", "Agbani", "Udi", "Nkanu West", "Nkanu East", "Ezeagu"]
    },
    {
      name: "Gombe",
      cities: ["Gombe", "Kaltungo", "Dukku", "Yamaltu/Deba", "Akko", "Balanga", "Funakaye"]
    },
    {
      name: "Imo",
      cities: ["Owerri Municipal", "Owerri North", "Owerri West", "Orlu", "Okigwe", "Mgbidi", "Mbaitoli", "Ikeduru", "Oguta", "Aboh Mbaise", "Ahiazu Mbaise"]
    },
    {
      name: "Jigawa",
      cities: ["Dutse", "Hadejia", "Gumel", "Birnin Kudu", "Ringim", "Kazaure", "Babura"]
    },
    {
      name: "Kaduna",
      cities: ["Kaduna North", "Kaduna South", "Chikun", "Igabi", "Zaria", "Sabon Gari", "Kafanchan", "Sanga", "Lere", "Giwa"]
    },
    {
      name: "Kano",
      cities: ["Kano Municipal", "Dala", "Fagge", "Gwale", "Tarauni", "Nassarawa", "Ungogo", "Kumbotso", "Dawakin Kudu", "Dawakin Tofa", "Bichi", "Wudil"]
    },
    {
      name: "Katsina",
      cities: ["Katsina", "Daura", "Funtua", "Malumfashi", "Dutsin-Ma", "Kankia", "Mani"]
    },
    {
      name: "Kebbi",
      cities: ["Birnin Kebbi", "Argungu", "Yauri", "Zuru", "Jega", "Dandi", "Koko/Besse"]
    },
    {
      name: "Kogi",
      cities: ["Lokoja", "Okene", "Kabba", "Idah", "Ankpa", "Ajaokuta", "Dekina", "Ogori/Magongo"]
    },
    {
      name: "Kwara",
      cities: ["Ilorin East", "Ilorin West", "Ilorin South", "Offa", "Omu-Aran", "Lafiagi", "Edu", "Irepodun", "Moro"]
    },
    {
      name: "Lagos",
      cities: ["Ikeja", "Lekki", "Surulere", "Victoria Island", "Yaba", "Ikorodu", "Epe", "Badagry", "Alimosho", "Eti-Osa", "Oshodi-Isolo", "Agege", "Ifako-Ijaiye", "Kosofe", "Somolu", "Lagos Island", "Lagos Mainland", "Ajeromi-Ifelodun", "Amuwo-Odofin", "Ojo", "Maryland", "Apapa"]
    },
    {
      name: "Nasarawa",
      cities: ["Lafia", "Karu", "Keffi", "Akwanga", "Nasarawa", "Doma", "Toto"]
    },
    {
      name: "Niger",
      cities: ["Minna", "Suleja", "Bida", "Kontagora", "Lapai", "Mokwa", "Borgu"]
    },
    {
      name: "Ogun",
      cities: ["Abeokuta North", "Abeokuta South", "Ota", "Ijebu Ode", "Sagamu", "Ilaro", "Ewekoro", "Ifo", "Remo North"]
    },
    {
      name: "Ondo",
      cities: ["Akure North", "Akure South", "Ondo East", "Ondo West", "Owo", "Ikare", "Okitipupa", "Ile-Oluji", "Irele"]
    },
    {
      name: "Osun",
      cities: ["Osogbo", "Ile-Ife", "Ilesa", "Ede North", "Ede South", "Ila Orangun", "Ejigbo", "Ikirun"]
    },
    {
      name: "Oyo",
      cities: ["Ibadan North", "Ibadan Northeast", "Ibadan Northwest", "Ibadan Southeast", "Ibadan Southwest", "Ogbomosho North", "Ogbomosho South", "Oyo East", "Oyo West", "Saki", "Eruwa", "Iseyin"]
    },
    {
      name: "Plateau",
      cities: ["Jos North", "Jos South", "Jos East", "Bukuru", "Pankshin", "Shendam", "Barkin Ladi", "Mangu"]
    },
    {
      name: "Rivers",
      cities: ["Port Harcourt", "Obio-Akpor", "Bonny", "Eleme", "Oyigbo", "Ahoada East", "Ahoada West", "Degema", "Okrika", "Opobo/Nkoro", "Khana", "Gokana"]
    },
    {
      name: "Sokoto",
      cities: ["Sokoto North", "Sokoto South", "Wurno", "Tambuwal", "Bodinga", "Goronyo"]
    },
    {
      name: "Taraba",
      cities: ["Jalingo", "Wukari", "Bali", "Gashaka", "Sardauna", "Takum", "Karim Lamido"]
    },
    {
      name: "Yobe",
      cities: ["Damaturu", "Gashua", "Potiskum", "Nguru", "Geidam", "Bade"]
    },
    {
      name: "Zamfara",
      cities: ["Gusau", "Kaura Namoda", "Talata Mafara", "Anka", "Maru", "Bungudu"]
    },
    {
      name: "FCT",
      cities: ["Abuja Central", "Garki", "Wuse", "Maitama", "Asokoro", "Gwarinpa", "Kubwa", "Gwagwalada", "Abaji", "Bwari", "Kuje", "Kwali"]
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
