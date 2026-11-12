// Skin place names (Nov 11, Jade). A skin renames only these places. Never rename
// Ask for Help, Offer Help, Find resources, Emergency Response, Alerts, Messages,
// village chat, Campfire, Cottage Chat, Sister Campfire, Announcements, the
// Villages/Groups/Resources tabs, or the helper lines under titles.
// Each line: [English, Spanish]. "plain" is what shows in ( ) after the skin name
// inside longer words, so people still know which place it is.

export const SKIN_WORDS = {
  'My World': {
    es: 'Mi mundo', plain: ['your world', 'su mundo'],
    space: ['My Galaxy', 'Mi galaxia'], mycelium: ['My Forest', 'Mi bosque'], fairy: ['My Meadow', 'Mi pradera'],
  },
  'My Village': {
    es: 'Mi aldea', plain: ['your village', 'su aldea'],
    space: ['My Station', 'Mi estación'], mycelium: ['My Grove', 'Mi arboleda'], fairy: ['My Ring', 'Mi anillo'],
  },
  'My Cottage': {
    es: 'Mi casita', plain: ['your cottage', 'su casita'],
    space: ['My Cabin', 'Mi cabina'], mycelium: ['My Log', 'Mi tronco'], fairy: ['My Toadstool', 'Mi seta'],
  },
  'My Corner': {
    es: 'Mi rincón', plain: ['your corner', 'su rincón'],
    space: ['My Bunk', 'Mi litera'], mycelium: ['My Nook', 'Mi escondite'], fairy: ['My Hollow', 'Mi hueco'],
  },
  'Your garden': {
    es: 'Su jardín', plain: ['your garden', 'su jardín'],
    space: ['Your greenhouse', 'Su invernadero'], mycelium: ['Your moss patch', 'Su manto de musgo'], fairy: ['Your flower bed', 'Su cantero de flores'],
  },
  'Edit cottage': {
    es: 'Editar casita', plain: ['edit cottage', 'editar casita'],
    space: ['Edit cabin', 'Editar cabina'], mycelium: ['Edit log', 'Editar tronco'], fairy: ['Edit toadstool', 'Editar seta'],
  },
  'Your villages': {
    es: 'Sus aldeas', plain: ['your villages', 'sus aldeas'],
    space: ['Your stations', 'Sus estaciones'], mycelium: ['Your groves', 'Sus arboledas'], fairy: ['Your rings', 'Sus anillos'],
  },
}

// The second word on the top bar tabs ("My " + this). The plain word shows under it.
export const TAB_WORDS = {
  World: { space: ['Galaxy', 'Galaxia'], mycelium: ['Forest', 'Bosque'], fairy: ['Meadow', 'Pradera'] },
  Village: { space: ['Station', 'Estación'], mycelium: ['Grove', 'Arboleda'], fairy: ['Ring', 'Anillo'] },
  Cottage: { space: ['Cabin', 'Cabina'], mycelium: ['Log', 'Tronco'], fairy: ['Toadstool', 'Seta'] },
  Corner: { space: ['Bunk', 'Litera'], mycelium: ['Nook', 'Escondite'], fairy: ['Hollow', 'Hueco'] },
}
