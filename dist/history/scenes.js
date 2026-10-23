export const chapters = [
  { name: 'Primeiras marcas', period: 'Do pigmento às primeiras cidades', image: '01-primeiras-marcas.png', symbol: '◌' },
  { name: 'Cidades e histórias', period: 'Caminhos que aproximam pessoas', image: '06-o-jardim-das-historias.png', symbol: '⌘' },
  { name: 'Novos horizontes', period: 'O mundo que criamos juntos', image: '09-a-cidade-que-criamos.png', symbol: '✧' },
];
export const scenes = [
  ['01-primeiras-marcas','As primeiras marcas','Pré-história','Tudo começa com uma marca. A terra vermelha encontra a parede da caverna — e uma nova forma de contar histórias nasce.','Do outro lado do riacho, pequenas casas começam a aparecer. Sua próxima história está à margem do rio.','Pigmentos da terra'],
  ['02-a-aldeia-do-rio','A aldeia do rio','Primeiras aldeias','A cor sai das cavernas e chega aos objetos do dia a dia. Entre plantações e cerâmicas, um lugar ganha vida.','O rio segue adiante. Suas águas revelam uma civilização de jardins, monumentos e novos pigmentos.','Argila e fibras'],
  ['03-o-vale-do-nilo','O vale do Nilo','Egito antigo','O mesmo rio agora abraça um mundo de pedra, papiro e jardins. Cada cor guarda uma pequena memória deste vale.','No fim do rio, o porto espera. O mar vai levar suas cores até outras cidades.','Pincel de junco'],
  ['04-o-porto-das-ideias','O porto das ideias','Grécia antiga','No porto, histórias viajam junto com as pessoas. Um vaso, uma fachada e uma oliveira recebem as cores desse encontro.','A estrada de pedra continua. Uma grande ponte liga os próximos encontros da sua jornada.','Cerâmica pintada'],
  ['05-a-ponte-dos-encontros','A ponte dos encontros','Roma antiga','Pequenos pedaços formam um mosaico. Assim como as cores, os caminhos aproximam lugares e pessoas.','Depois da ponte, uma vila se esconde entre as colinas. Lá, as cores também vão morar nas páginas.','Mosaicos'],
  ['06-o-jardim-das-historias','O jardim das histórias','Idade Média','Entre um jardim e um ateliê, cada página é uma nova descoberta. Colorir também é uma forma de guardar histórias.','A rua da vila se abre em uma praça. Novos artistas estão descobrindo outras maneiras de olhar o mundo.','Páginas iluminadas'],
  ['07-a-praca-dos-artistas','A praça dos artistas','Renascimento','A praça se enche de telas e pigmentos. Luz, sombra e cor encontram novas maneiras de mostrar o que vemos.','Os ateliês crescem e chegam a um bairro de oficinas. Novos materiais aguardam no próximo caminho.','Telas e pigmentos'],
  ['08-a-oficina-dos-novos-tons','A oficina dos novos tons','Era industrial','As oficinas trazem novos instrumentos. O canal acompanha a criação de um bairro cheio de possibilidades.','A antiga oficina abre suas portas para a comunidade. As marcas de toda a viagem vão se encontrar ali.','Novos instrumentos'],
  ['09-a-cidade-que-criamos','A cidade que criamos','Nosso tempo','Uma mão, um vaso, um sol, um mosaico. O mural reúne as histórias da viagem — e agora também guarda a sua.','Você chegou ao fim deste caminho. As cores que criou ficam com você, prontas para um novo começo.','Criação em comunidade'],
].map(([id,title,era,intro,outro,discovery],index)=>({id,title,era,intro,outro,discovery,index,chapter:Math.floor(index/3),image:`./history/images/${id}.png`,regions:`./history/regions/${id}.json`}));

export const levels = [
  { id:'easy', name:'Fácil', count:24, description:'24 áreas maiores' },
  { id:'medium', name:'Médio', count:40, description:'40 áreas para descobrir' },
  { id:'hard', name:'Difícil', count:70, description:'70 áreas e mais detalhes' },
];
export const pigments = [
  ['Ocre do sol','#D4A34E'], ['Terra vermelha','#B9684E'], ['Verde das folhas','#728452'],
  ['Azul das águas','#548E98'], ['Sombra de terra','#795D49'], ['Areia e pedra','#D8C9A8'],
];
