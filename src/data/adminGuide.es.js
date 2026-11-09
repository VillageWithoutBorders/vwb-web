// La Guía para administradores de VWB, en español (Nov 9, Jade: "go ahead").
// Same sections, ids and block types as adminGuide.js. When the English guide
// changes, change this file to match. Buttons on the admin pages are in
// Spanish too (Nov 9), so the guide names them the way they show on screen.
// A native Spanish speaker should read this, like es.js and es-more.js.

export const GUIDE_UPDATED = '7 de noviembre de 2026'

export const ADMIN_GUIDE = [
  {
    id: 'what', title: 'Qué es un administrador de VWB',
    blocks: [
      { p: 'Un administrador de VWB es parte del equipo de VWB. Usted responde reportes, aprueba grupos y Embajadores de Esperanza, revisa emergencias y ayuda cuando alguien necesita apoyo o protección.' },
      { p: 'Usted es vecino primero. Las herramientas de administrador están para servir a la aldea, no para mandarla. Los grupos y las aldeas toman sus propias decisiones. Los administradores de VWB solo intervienen cuando alguien rompe las reglas de la app o no está seguro.' },
      { p: '**Las aldeas se cuidan solas.** Cada aldea tiene un Guardián y Ayudantes, con un Embajador de Esperanza cerca. Usted interviene cuando alguien rompe las reglas de la app o no está seguro, y ayuda a encontrar un Guardián cuando una aldea no tiene. Su bandeja muestra las aldeas sin Guardián ni Ayudante, y las aldeas sin Embajador de Esperanza.' },
      { h3: 'Un administrador sí' },
      { ul: [
        'Responde lo que espera en la bandeja de administración, primero lo urgente',
        'Revisa reportes de emergencias y reportes de miembros en sus aldeas',
        'Aprueba grupos, Embajadores de Esperanza y pedidos para manejar un recurso',
        'Habla con calma y amabilidad, aunque la otra persona esté molesta',
      ] },
      { h3: 'Un administrador no' },
      { ul: [
        'Lee chats ni mensajes privados (VWB no puede abrirlos, y usted nunca lo intenta)',
        'Busca a personas por curiosidad',
        'Toma solo decisiones grandes que la app dice que necesitan dos administradores',
        'Habla en público en nombre de VWB sin el permiso de la fundadora',
      ] },
    ],
  },
  {
    id: 'promises', title: 'Las cinco promesas',
    blocks: [
      { p: 'Todo administrador acepta estas promesas antes de empezar. Son el corazón de esta guía.' },
      { ol: [
        '**Solo veré lo que necesito para ayudar a alguien.** Abra los datos de una persona cuando esté trabajando en algo sobre ella, y nunca en otro momento.',
        '**Nunca intentaré leer chats ni mensajes privados.** VWB está hecho para que ningún administrador pueda. Si alguien comparte su propia copia en un reporte, esa es la única forma en que usted la ve.',
        '**Guardaré para mí la información de las personas.** Lo que usted ve como administrador se queda entre los administradores de VWB. No lo repite a amigos, familia ni otros grupos.',
        '**Preguntaré a otro administrador cuando no esté seguro.** Preguntar es una fortaleza, no una debilidad. Las decisiones grandes se toman juntos.',
        '**Dejaré el puesto si ya no puedo participar.** La vida cambia. Dejar el puesto con cuidado mantiene segura a la aldea.',
      ] },
    ],
  },
  {
    id: 'first-30', title: 'Sus primeros 30 días',
    blocks: [
      { p: '**Por ahora, los administradores son solo el equipo de VWB.** No se están sumando administradores nuevos. Esta parte es para cuando eso se abra otra vez.' },
      { p: 'Todo administrador nuevo empieza con 30 días de aprendizaje, con un administrador mentor a su lado. No pasa nada malo si usted está en este tiempo. Así empiezan todos.' },
      { h3: 'Durante sus primeros 30 días' },
      { ul: [
        'Usted cuida la aldea que pidió, y ninguna otra.',
        'No puede expulsar a nadie. Pregunte a su mentor o a otro administrador.',
        'No puede restablecer la cuenta ni la verificación en dos pasos de alguien. Pregunte a otro administrador.',
        'Todavía no puede decidir sobre administradores nuevos.',
        'Todo lo demás está abierto para usted: la bandeja, los reportes, las emergencias, las aprobaciones.',
      ] },
      { h3: 'Su mentor' },
      { ul: [
        'Responde sus preguntas y le pregunta cómo va.',
        'Se nombra cuando usted es aprobado. Puede ver quién es en **Administración**, **Gente**.',
        'Después de 30 días, toca **Listo** (usted recibe todas las herramientas) o **Todavía no** (30 días más). La fundadora puede decidir en cualquier momento.',
      ] },
      { p: '**Buenos hábitos para empezar ya:** revise la bandeja una vez al día, lea el **Registro de administradores** para ver cómo otros manejan las cosas, y pregunte antes de actuar cuando algo se sienta grande.' },
    ],
  },
  {
    id: 'daily', title: 'Su rutina de cada día',
    blocks: [
      { p: 'Abra el escudo una vez al día y atienda primero lo urgente.' },
      { ol: [
        '**Prenda la verificación en dos pasos.** Las herramientas de administrador quedan cerradas hasta que lo haga. Vaya a Ajustes, Verificación en dos pasos, y siga los pasos con una app de autenticación en su teléfono. Después, siempre entre con su código. Las herramientas de administrador lo necesitan.',
        '**Toque el escudo en la barra de arriba.** El número muestra cuántas cosas esperan. Rojo quiere decir que algo es urgente. Dorado quiere decir que nada es urgente.',
        '**Empiece con Le espera.** Es una sola lista que comparten todos los administradores. Cuando uno de ustedes atiende algo, sale de la lista para todos.',
        '**Vea quién ya lo está atendiendo.** Cuando usted toca **Abrir**, los otros administradores ven "Sam abrió esto" por 30 minutos, para que dos de ustedes no hagan lo mismo. Si alguien lo abrió hace un minuto, elija otra cosa o escríbale.',
        '**Haga primero el grupo Urgente.** Reportes de emergencia por revisar, reportes de miembros, tareas que salieron mal, y todo lo que espera a un segundo administrador.',
        '**Después, el grupo Esperando.** Solicitudes, grupos, pedidos para manejar un recurso, mensajes de la página de Ayuda y reportes de recursos.',
        '**Mire Últimos avisos de administradores.** Son los mismos avisos que suenan en los teléfonos de los administradores.',
      ] },
      { p: '**Avisos en su teléfono:** cada cosa nueva de administración manda un aviso a todos los administradores. El trabajo de administración ya no sale en sus Avisos personales. Si escondió los detalles en la pantalla bloqueada, el aviso solo dice que algo está esperando.' },
      { p: '**En el teléfono o en la computadora:** todas las herramientas de administrador funcionan en los dos. La computadora solo da más espacio para Aldeas, Compartir habilidades e Importar CRN.' },
    ],
  },
  {
    id: 'who', title: 'Quién puede hacer qué',
    blocks: [
      { p: 'Casi todo el trabajo lo puede hacer usted solo. Todo lo que cambia la posición de alguien necesita dos administradores o a la fundadora. Cada acción queda en el **Registro de administradores**, que todos pueden leer y nadie puede cambiar.' },
      { table: {
        head: ['Acción', 'Un administrador solo', 'Necesita dos administradores', 'Fundadora'],
        rows: [
          ['Responder reportes, mensajes de la página de Ayuda, emergencias', 'Sí', 'No', 'Sí'],
          ['Aprobar grupos y pedidos para manejar un recurso', 'Sí', 'No', 'Sí'],
          ['Hacer a alguien Embajador de Esperanza', 'Sí', 'No', 'Sí'],
          ['Expulsar a un vecino', 'Sí (no en los primeros 30 días)', 'No', 'Sí'],
          ['Expulsar a un Embajador de Esperanza, Ayudante, Guardián, organizador o Líder', 'No', 'Sí: uno lo pide y otro está de acuerdo', 'Sola'],
          ['Restablecer la verificación en dos pasos de alguien', 'Vecinos y embajadores (no en los primeros 30 días)', 'No', 'Cualquiera menos la fundadora'],
          ['Hacer administrador a alguien', 'No', 'Sí: dos "sí" de personas distintas', 'Sola, y elige al mentor'],
          ['Quitar a un administrador', 'No', 'Sí: uno lo pide y otro está de acuerdo', 'Sola'],
          ['Expulsar a un administrador', 'No', 'No', 'Sola'],
          ['Dar a los administradores sus aldeas', 'No', 'No', 'Sola'],
          ['Pedir a alguien que cuide una aldea', 'Sí, desde Aldeas, Gente y líderes. La persona dice que sí primero. (Un Embajador de Esperanza que vive allí también puede, cuando la aldea no tiene Guardián activo)', 'No', 'Le pide a cualquiera; la persona dice que sí primero'],
          ['Cambiar el papel de fundadora', 'No', 'No', 'Solo en la base de datos, a propósito'],
        ],
      } },
      { p: 'La persona sobre quien se decide nunca puede responder esa decisión. Usted siempre puede dejar el puesto por su cuenta, en Ajustes, con Volver a Vecino.' },
      { p: '**Los Embajadores de Esperanza trabajan en su propia zona.** Revisan emergencias, deciden sobre equipos que piden responder, y publican novedades de emergencias solo en las aldeas a las que pertenecen. Arreglan listados de recursos al momento solo en su propia zona, que eligen en Ajustes, Cuenta y privacidad. En cualquier otro lugar, sus cambios van a revisión. Los administradores de VWB pueden hacer todo esto en cualquier lugar. Cuando un Embajador no puede actuar sobre algo fuera de su zona, un administrador o un Embajador de allí lo toma.' },
      { p: '**Las aldeas se cuidan solas.** Cada aldea tiene un Guardián y hasta 2 Ayudantes. Los reportes hechos dentro de una aldea, un grupo o un equipo también van a sus líderes, nunca con el nombre de quien reporta. Un líder que no abre VWB en 60 días recibe una pregunta. Si no responde en 14 días, el papel pasa a otra persona. Cuando una aldea no tiene Guardián activo, un Embajador de Esperanza que vive allí, un administrador de VWB o la fundadora puede pedir a un vecino que lo tome. Un grupo o un equipo puede elegir un círculo de cuidado de 2 a 5 miembros para leer sus reportes en lugar de sus líderes.' },
    ],
  },
  {
    id: 'situations', title: 'Situaciones comunes',
    blocks: [
      { p: 'Cada una empieza desde el escudo, luego **Le espera**, luego **Abrir**.' },
      { h3: 'Un reporte de emergencia por revisar' },
      { ol: [
        'Lea lo que se reportó y dónde.',
        'Revise si es real: noticias locales, un vecino de confianza, o quien reportó.',
        'Es real: toque **Verificar**, para que los vecinos y los equipos de emergencia puedan responder. No es real o ya pasó: ciérrelo. Si usted lo verificó, puede cerrarlo solo cuando termine.',
        'Dos reportes de lo mismo: junte el repetido con el primero.',
      ] },
      { h3: 'Un reporte de un miembro sobre una persona' },
      { ol: [
        'Lea los dos lados si puede. Escriba a quien reportó para preguntar qué pasó.',
        'Agregue una nota privada (solo la ven los administradores).',
        'Márquelo como revisado, o descartado si no pasó nada malo.',
        'Alguien no está seguro: expúlselo. Para un Embajador de Esperanza o cualquiera que dirija una aldea, un grupo o un equipo, toque **Pedir la expulsión**, y un segundo administrador está de acuerdo en **Reportes**.',
      ] },
      { h3: 'Un aviso de seguridad durante una tarea' },
      { ol: [
        'Trátelo como urgente. Escriba de inmediato a la persona que lo mandó.',
        'Alguien puede estar en peligro: dígale que llame al 911. VWB no es un servicio de emergencias.',
        'Escriba en la nota lo que pasó, y vuelva a preguntar al día siguiente.',
      ] },
      { h3: 'Un mensaje de la página de Ayuda' },
      { ol: [
        'Responda con amabilidad, por mensaje, si dejaron su nombre.',
        'Un problema con la app: márquelo para seguirlo y avise a la fundadora.',
        'Márquelo como hecho cuando esté resuelto.',
      ] },
      { h3: 'Un reporte de recurso (un listado está mal o no es seguro)' },
      { ol: [
        'Abra **Reportes por revisar** desde la bandeja.',
        'Revise el sitio web del propio listado o llámelos.',
        'Apruebe el cambio, o rechácelo con una nota corta. Un reporte de seguridad pausa el listado hasta que alguien lo revise.',
      ] },
      { h3: 'Un grupo que pide unirse' },
      { ol: [
        'Mire su sitio web y sus redes sociales.',
        'Escriba a su contacto si algo no está claro.',
        'Apruebe cuando sean reales y sigan las reglas de VWB.',
      ] },
      { h3: 'Una solicitud para ser Embajador de Esperanza' },
      { ol: [
        'Lea por qué quieren ayudar y lo que escribieron sobre sí mismos.',
        'Pregunte a gente de su aldea que los conozca.',
        'Diga que sí o que no. Un no les manda una nota amable; pueden pedirlo otra vez más adelante.',
      ] },
      { h3: 'Una aldea no tiene Guardián ni Ayudante' },
      { ol: [
        'Su bandeja muestra las aldeas sin Guardián ni Ayudante, y las aldeas sin Embajador de Esperanza.',
        'Un Embajador de Esperanza que vive allí puede pedírselo a un vecino desde la página de Embajadores. Si la aldea no tiene Embajador, avise a la fundadora.',
        'Cuando alguien diga que sí, dele la bienvenida y muéstrele las herramientas del Guardián.',
      ] },
      { h3: 'La fundadora le pide que cuide una aldea' },
      { ol: [
        'Le llega un aviso, y sale una tarjeta dorada en la página de esa aldea. Nada cambia hasta que usted responda.',
        'Ábrala para ver qué cambia. Si todavía no está en el chat de esa aldea, decir que sí lo une, después del aviso de siempre.',
        'Diga que sí, o no, gracias. Si dice que sí, el Guardián de ahora pasa a ser Ayudante y todavía puede publicar anuncios.',
      ] },
    ],
  },
  {
    id: 'privacy', title: 'La privacidad y sus aldeas',
    blocks: [
      { p: 'Usted ve a la gente de las aldeas que le da la fundadora, y los datos privados de nadie más.' },
      { h3: 'En Gente, usted ve' },
      { ul: [
        'La gente de sus aldeas',
        'Todos los administradores y la fundadora',
        'La gente que todavía no se ha unido a una aldea, para que nadie se quede fuera',
        'Cualquiera que espera una revisión de un Embajador de Esperanza o de un administrador',
      ] },
      { p: 'Los nombres en reportes y avisos se siguen viendo para gente fuera de sus aldeas, porque los nombres ya son públicos en los perfiles.' },
      { h3: 'Lo que queda privado, aun para los administradores' },
      { ul: [
        'Mensajes privados, Chats de la casita y chats de aldea cifrados. VWB no puede abrirlos.',
        'Correos electrónicos completos. Los administradores los ven en parte escondidos; solo la fundadora los ve completos.',
        'Dónde vive alguien. VWB nunca muestra nada que pueda ayudar a encontrar a una persona. Nunca pida una dirección en público, y nunca comparta una.',
      ] },
      { p: '**Buena costumbre:** hable de una persona solo con los administradores que necesitan saber. No tome capturas de pantalla de los datos de nadie. Si comparte su pantalla, cierre Administración primero.' },
    ],
  },
  {
    id: 'help', title: 'Cuándo pedir ayuda',
    blocks: [
      { p: 'Si tiene dudas, pregunte antes de actuar. Nunca va a tener problemas por preguntar.' },
      { h3: 'Pregunte a otro administrador o a su mentor cuando' },
      { ul: [
        'Usted conoce bien a la persona, o está molesto con ella',
        'Un reporte podría terminar en una expulsión',
        'Dos personas cuentan historias muy distintas',
        'No está seguro de que se rompió una regla',
      ] },
      { h3: 'Avise a la fundadora cuando' },
      { ul: [
        'Alguien puede estar en peligro, o la policía está involucrada',
        'Un reportero, periodista o funcionario pregunta sobre VWB o un miembro',
        'Alguien amenaza con acciones legales',
        'Usted cree que un administrador rompió una promesa',
        'Algo en la app se ve roto o no seguro',
      ] },
      { p: '**Alguien en peligro ahora mismo:** dígale que llame primero al 911. Después avise a la fundadora.' },
    ],
  },
  {
    id: 'stepping-down', title: 'Dejar el puesto',
    blocks: [
      { p: 'Puede dejar el puesto cuando quiera, sin dar razones. Gracias por el tiempo que dio.' },
      { ol: [
        '**Avise primero a su mentor o a la fundadora**, para que su trabajo quede cubierto.',
        '**Asegúrese de que sus aldeas queden cubiertas.** Revise que cada una tenga un Guardián, un Ayudante y un Embajador de Esperanza cerca.',
        '**Pase lo que está abierto.** Termine o pase a otra persona lo que estaba haciendo, con una nota.',
        '**Deje el puesto en Ajustes** con Volver a Vecino. Sigue siendo miembro y conserva sus amistades, chats e historial.',
      ] },
      { p: '**Si deja de entrar:** después de 60 días sin entrar, VWB pregunta si sigue participando. Con entrar basta para decir que sí. Si no responde, la fundadora puede quitarle el acceso de administrador. No es un castigo; mantiene la aldea cubierta y la cuenta segura.' },
      { p: '**Si los administradores necesitan quitarle el puesto:** se necesita a la fundadora, o a dos administradores de acuerdo. Cada cambio queda en el registro de **Cambios de funciones** que todos los administradores pueden ver.' },
    ],
  },
  {
    id: 'words', title: 'Palabras sencillas',
    blocks: [
      { table: {
        head: ['Palabra', 'Qué quiere decir'],
        rows: [
          ['Registro de administradores', 'Lo que hicieron los administradores. Todos pueden leerlo; nadie puede cambiarlo.'],
          ['Pedir la expulsión / Pedir que le saquen', 'Empieza un pedido que un segundo administrador tiene que aprobar.'],
          ['Fundadora', 'La persona que empezó VWB. Puede decidir sola donde otros necesitan dos administradores.'],
          ['Embajador de Esperanza', 'Un vecino de confianza que ayuda en su zona, revisa emergencias y aprueba equipos de emergencia.'],
          ['Ayudante', 'Un vecino que el Guardián nombra para ayudar a cuidar una aldea o un equipo de emergencia.'],
          ['Guardián', 'El vecino que cuida una aldea o un equipo de emergencia.'],
          ['Mentor', 'El administrador que guía a un administrador nuevo en sus primeros 30 días.'],
          ['Le espera', 'La lista compartida de todo lo que espera a un administrador.'],
          ['Cambios de funciones', 'El registro de quién recibió o perdió el acceso de administrador, y quién estuvo de acuerdo.'],
          ['Escudo', 'El botón de administración en la barra de arriba. Su número muestra lo que espera.'],
          ['Verificación en dos pasos', 'Un código de una app en su teléfono, que se usa con su contraseña. Se necesita para las herramientas de administrador.'],
          ['Aldea', 'Un grupo de vecinos que comparten códigos postales y un chat de aldea.'],
          ['Responder por alguien', 'Cuando un miembro dice que lo conoce y confía en usted.'],
        ],
      } },
    ],
  },
]
