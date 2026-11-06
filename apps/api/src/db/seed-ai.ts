/**
 * Demo data for the AI learning layer at the GCIS demo school: an exam question bank
 * (JAMB, WAEC, NECO and BECE style, written for the demo, not copied from real papers),
 * the school's own material in the knowledge base, exam goals, mocks and a tutor chat.
 * Everything goes through the real API, as in seed.ts.
 */
import { PDFDocument, StandardFonts } from 'pdf-lib';

type Json = Record<string, any>;
type Call = <T = any>(token: string | null, method: string, path: string, body?: unknown) => Promise<T>;
type Q = { topic: string; body: string; options: [string, string, string, string]; answer: 'A' | 'B' | 'C' | 'D'; explanation: string };

// ---------------------------------------------------------------- Exam question bank

const SENIOR: Record<string, { exam: 'jamb' | 'waec' | 'neco'; qs: Q[] }> = {
  ENG: {
    exam: 'jamb',
    qs: [
      { topic: 'Concord', body: 'The news of his promotion ___ everyone.', options: ['have surprised', 'were surprising', 'has surprised', 'are surprising'], answer: 'C', explanation: '"News" is uncountable and takes a singular verb: has surprised.' },
      { topic: 'Concord', body: 'One of the girls who ___ in the choir is my cousin.', options: ['sing', 'sings', 'is singing', 'has sung'], answer: 'A', explanation: '"Who" refers to "the girls" (plural), so the verb in that clause is plural: sing.' },
      { topic: 'Concord', body: 'Mathematics ___ my favourite subject.', options: ['are', 'were', 'is', 'have been'], answer: 'C', explanation: 'Names of subjects ending in -ics, like Mathematics and Physics, take a singular verb.' },
      { topic: 'Concord', body: 'The committee ___ divided over the new rules.', options: ['is', 'was', 'were', 'has been'], answer: 'C', explanation: 'When members of a collective noun act as individuals (here they disagree), the verb is plural.' },
      { topic: 'Concord', body: 'Bread and butter ___ his usual breakfast.', options: ['are', 'is', 'were', 'have been'], answer: 'B', explanation: '"Bread and butter" is one dish, so it takes a singular verb.' },
      { topic: 'Lexis', body: 'Choose the word nearest in meaning to the underlined word: The principal gave a TERSE reply.', options: ['brief', 'rude', 'kind', 'long'], answer: 'A', explanation: 'Terse means brief and to the point.' },
      { topic: 'Lexis', body: 'Choose the word nearest in meaning: The soldiers were VIGILANT all night.', options: ['sleepy', 'watchful', 'afraid', 'noisy'], answer: 'B', explanation: 'Vigilant means watchful and alert.' },
      { topic: 'Lexis', body: 'Choose the word opposite in meaning to GENEROUS.', options: ['kind', 'wealthy', 'stingy', 'humble'], answer: 'C', explanation: 'Generous means willing to give; stingy means unwilling to give.' },
      { topic: 'Lexis', body: 'Choose the word opposite in meaning: The story was FABRICATED.', options: ['invented', 'genuine', 'spread', 'false'], answer: 'B', explanation: 'Fabricated means made up; the opposite is genuine (true).' },
      { topic: 'Lexis', body: 'Choose the word nearest in meaning: Ada’s explanation was LUCID.', options: ['clear', 'long', 'confusing', 'loud'], answer: 'A', explanation: 'Lucid means clear and easy to understand.' },
      { topic: 'Oral English', body: 'Which word has the same vowel sound as "boot"?', options: ['foot', 'food', 'book', 'good'], answer: 'B', explanation: '"Boot" and "food" both have the long vowel /uː/; the others have /ʊ/.' },
      { topic: 'Oral English', body: 'Which word is stressed on the second syllable?', options: ['table', 'begin', 'water', 'happy'], answer: 'B', explanation: 'be-GIN is stressed on the second syllable; the others on the first.' },
      { topic: 'Oral English', body: 'Which word contains the sound /θ/?', options: ['this', 'that', 'think', 'there'], answer: 'C', explanation: '"Think" begins with the voiceless /θ/; the others begin with the voiced /ð/.' },
      { topic: 'Idioms', body: 'To "let the cat out of the bag" means to', options: ['free an animal', 'reveal a secret', 'cause trouble', 'travel away'], answer: 'B', explanation: 'The idiom means to reveal a secret by mistake.' },
      { topic: 'Idioms', body: '"Emeka is a wet blanket" means Emeka', options: ['is often sick', 'spoils other people’s fun', 'is always cold', 'is very generous'], answer: 'B', explanation: 'A wet blanket is someone who spoils the fun of others.' },
      { topic: 'Idioms', body: 'To "burn the midnight oil" means to', options: ['waste fuel', 'study or work late into the night', 'start a fire', 'sleep early'], answer: 'B', explanation: 'It means working or studying late at night.' },
      { topic: 'Prepositions', body: 'She is good ___ Mathematics.', options: ['in', 'at', 'on', 'for'], answer: 'B', explanation: 'The correct expression is "good at" a subject or skill.' },
      { topic: 'Prepositions', body: 'The students congratulated Tolu ___ her success.', options: ['for', 'on', 'at', 'with'], answer: 'B', explanation: 'We congratulate someone ON something.' },
      { topic: 'Prepositions', body: 'He was accused ___ stealing.', options: ['for', 'with', 'of', 'on'], answer: 'C', explanation: 'The correct expression is "accused of".' },
      { topic: 'Spelling', body: 'Choose the correctly spelt word.', options: ['accomodation', 'accommodation', 'acommodation', 'accommadation'], answer: 'B', explanation: 'Accommodation has double c and double m.' },
    ],
  },
  MTH: {
    exam: 'jamb',
    qs: [
      { topic: 'Indices', body: 'Simplify 8^(2/3).', options: ['2', '4', '6', '16'], answer: 'B', explanation: 'The cube root of 8 is 2, and 2² = 4.' },
      { topic: 'Indices', body: 'Solve 2^(x + 1) = 32.', options: ['3', '4', '5', '6'], answer: 'B', explanation: '32 = 2⁵, so x + 1 = 5 and x = 4.' },
      { topic: 'Indices', body: 'Simplify (3² × 3³) ÷ 3⁴.', options: ['1', '3', '9', '27'], answer: 'B', explanation: '3^(2 + 3 − 4) = 3¹ = 3.' },
      { topic: 'Logarithms', body: 'Evaluate log₂ 64.', options: ['4', '5', '6', '8'], answer: 'C', explanation: '2⁶ = 64, so log₂ 64 = 6.' },
      { topic: 'Logarithms', body: 'Given log 2 = 0.3010, find log 8.', options: ['0.6020', '0.9030', '1.2040', '2.4080'], answer: 'B', explanation: 'log 8 = log 2³ = 3 × 0.3010 = 0.9030.' },
      { topic: 'Logarithms', body: 'Simplify log 5 + log 20.', options: ['1', '2', 'log 25', '100'], answer: 'B', explanation: 'log 5 + log 20 = log (5 × 20) = log 100 = 2.' },
      { topic: 'Quadratic equations', body: 'Solve x² − 9 = 0.', options: ['x = 3 only', 'x = ±3', 'x = 9', 'x = ±9'], answer: 'B', explanation: 'x² = 9, so x = 3 or x = −3.' },
      { topic: 'Quadratic equations', body: 'Find the product of the roots of 3x² + 5x − 12 = 0.', options: ['−4', '4', '−5/3', '5/3'], answer: 'A', explanation: 'Product of roots = c/a = −12/3 = −4.' },
      { topic: 'Quadratic equations', body: 'Factorise x² + 5x + 6.', options: ['(x + 1)(x + 6)', '(x + 2)(x + 3)', '(x − 2)(x − 3)', '(x + 5)(x + 1)'], answer: 'B', explanation: '2 × 3 = 6 and 2 + 3 = 5, so x² + 5x + 6 = (x + 2)(x + 3).' },
      { topic: 'Probability', body: 'A bag has 3 red and 5 blue balls. One ball is picked at random. What is the probability that it is red?', options: ['3/5', '3/8', '5/8', '1/3'], answer: 'B', explanation: '3 red out of 8 balls: 3/8.' },
      { topic: 'Probability', body: 'A day of the week is chosen at random. What is the probability that it is Saturday or Sunday?', options: ['1/7', '2/7', '5/7', '1/2'], answer: 'B', explanation: '2 favourable days out of 7.' },
      { topic: 'Statistics', body: 'Find the mode of 2, 3, 3, 5, 7, 3, 5.', options: ['2', '3', '5', '7'], answer: 'B', explanation: '3 appears three times, more than any other number.' },
      { topic: 'Statistics', body: 'Find the range of 12, 7, 20, 15, 9.', options: ['8', '11', '13', '20'], answer: 'C', explanation: 'Range = highest − lowest = 20 − 7 = 13.' },
      { topic: 'Variation', body: 'x varies inversely as y. If x = 6 when y = 4, find x when y = 8.', options: ['3', '12', '2', '48'], answer: 'A', explanation: 'x = k/y, so k = 24 and x = 24/8 = 3.' },
      { topic: 'Sets', body: 'If A = {1, 2, 3, 4} and B = {3, 4, 5}, find A ∩ B.', options: ['{1, 2}', '{3, 4}', '{1, 2, 3, 4, 5}', '{5}'], answer: 'B', explanation: 'The intersection holds the elements in both sets: 3 and 4.' },
      { topic: 'Simple interest', body: 'Find the simple interest on ₦20,000 at 5% per annum for 3 years.', options: ['₦1,000', '₦3,000', '₦6,000', '₦300'], answer: 'B', explanation: 'I = PRT/100 = 20,000 × 5 × 3 / 100 = ₦3,000.' },
    ],
  },
  PHY: {
    exam: 'jamb',
    qs: [
      { topic: "Ohm's law", body: 'A current of 2 A flows through a 6 Ω resistor. Find the potential difference across it.', options: ['3 V', '8 V', '12 V', '0.33 V'], answer: 'C', explanation: 'V = IR = 2 × 6 = 12 V.' },
      { topic: "Ohm's law", body: 'Ohm’s law holds for a metallic conductor provided its ___ stays constant.', options: ['current', 'voltage', 'temperature', 'length of connecting wire'], answer: 'C', explanation: 'Resistance changes with temperature, so Ohm’s law needs constant temperature.' },
      { topic: "Ohm's law", body: 'The SI unit of electrical resistance is the', options: ['ampere', 'volt', 'ohm', 'watt'], answer: 'C', explanation: 'Resistance is measured in ohms (Ω).' },
      { topic: 'Electricity', body: 'Resistors of 2 Ω, 3 Ω and 5 Ω are connected in series. Find the total resistance.', options: ['1 Ω', '5 Ω', '10 Ω', '30 Ω'], answer: 'C', explanation: 'In series, resistances add: 2 + 3 + 5 = 10 Ω.' },
      { topic: 'Electricity', body: 'An electric iron draws 5 A from a 240 V supply. What is its power?', options: ['48 W', '245 W', '1200 W', '2400 W'], answer: 'C', explanation: 'P = IV = 5 × 240 = 1200 W.' },
      { topic: 'Motion', body: 'A body travels 100 m in 20 s. Find its average speed.', options: ['2 m/s', '5 m/s', '20 m/s', '2000 m/s'], answer: 'B', explanation: 'Speed = distance ÷ time = 100 ÷ 20 = 5 m/s.' },
      { topic: 'Motion', body: 'A stone is dropped from rest and falls for 2 s (g = 10 m/s²). How far does it fall?', options: ['10 m', '20 m', '40 m', '5 m'], answer: 'B', explanation: 's = ½gt² = ½ × 10 × 2² = 20 m.' },
      { topic: 'Motion', body: 'Newton’s first law of motion is also called the law of', options: ['acceleration', 'inertia', 'reaction', 'gravitation'], answer: 'B', explanation: 'A body stays at rest or in uniform motion unless a force acts: this is inertia.' },
      { topic: 'Waves', body: 'Sound waves in air are', options: ['transverse', 'longitudinal', 'electromagnetic', 'always stationary'], answer: 'B', explanation: 'Air particles vibrate along the direction the sound travels: longitudinal.' },
      { topic: 'Waves', body: 'A sound wave of speed 340 m/s has a frequency of 170 Hz. Find its wavelength.', options: ['0.5 m', '2 m', '170 m', '510 m'], answer: 'B', explanation: 'λ = v/f = 340 ÷ 170 = 2 m.' },
      { topic: 'Heat', body: 'Pure water boils at ___ at standard atmospheric pressure.', options: ['0 °C', '37 °C', '100 °C', '273 °C'], answer: 'C', explanation: 'The boiling point of pure water at 760 mmHg is 100 °C.' },
      { topic: 'Heat', body: 'Heat from the sun reaches the earth through space by', options: ['conduction', 'convection', 'radiation', 'evaporation'], answer: 'C', explanation: 'Only radiation can cross a vacuum.' },
    ],
  },
  CHE: {
    exam: 'neco',
    qs: [
      { topic: 'Mole concept', body: 'Find the molar mass of CO₂ (C = 12, O = 16).', options: ['28 g/mol', '44 g/mol', '32 g/mol', '40 g/mol'], answer: 'B', explanation: '12 + (2 × 16) = 44 g/mol.' },
      { topic: 'Mole concept', body: 'How many moles are in 5.6 g of nitrogen gas, N₂ (N = 14)?', options: ['0.2', '0.4', '2', '5'], answer: 'A', explanation: 'Molar mass of N₂ = 28 g/mol; 5.6 ÷ 28 = 0.2 mol.' },
      { topic: 'Mole concept', body: 'The volume occupied by one mole of any gas at s.t.p. is', options: ['11.2 dm³', '22.4 dm³', '24.0 dm³', '1.0 dm³'], answer: 'B', explanation: 'The molar volume of a gas at s.t.p. is 22.4 dm³.' },
      { topic: 'Periodic table', body: 'An element with atomic number 11 belongs to group', options: ['1', '2', '7', '11'], answer: 'A', explanation: 'Electron configuration 2, 8, 1: one outer electron, group 1 (sodium).' },
      { topic: 'Periodic table', body: 'Across a period from left to right, atomic radius generally', options: ['increases', 'decreases', 'stays the same', 'doubles'], answer: 'B', explanation: 'Nuclear charge increases and pulls the electrons closer.' },
      { topic: 'Acids, bases and salts', body: 'The pH of a neutral solution at 25 °C is', options: ['0', '1', '7', '14'], answer: 'C', explanation: 'Neutral solutions have pH 7.' },
      { topic: 'Acids, bases and salts', body: 'An acid turns blue litmus paper', options: ['red', 'green', 'colourless', 'yellow'], answer: 'A', explanation: 'Acids turn blue litmus red.' },
      { topic: 'Chemical bonding', body: 'The bond in sodium chloride is', options: ['covalent', 'ionic', 'metallic', 'hydrogen'], answer: 'B', explanation: 'Sodium gives an electron to chlorine, forming ions held by ionic bonds.' },
      { topic: 'Chemical bonding', body: 'The atoms in a water molecule are held together by', options: ['ionic bonds', 'covalent bonds', 'metallic bonds', 'dative bonds only'], answer: 'B', explanation: 'Hydrogen and oxygen share electrons: covalent bonds.' },
      { topic: 'Separation techniques', body: 'The best way to obtain salt from salt solution is', options: ['filtration', 'evaporation', 'sublimation', 'decantation'], answer: 'B', explanation: 'Evaporating the water leaves the salt behind.' },
      { topic: 'Separation techniques', body: 'A mixture of iodine and sand can be separated by', options: ['filtration', 'sublimation', 'distillation', 'chromatography'], answer: 'B', explanation: 'Iodine sublimes on heating; sand does not.' },
      { topic: 'Rates of reaction', body: 'A catalyst speeds up a reaction by', options: ['raising the temperature', 'lowering the activation energy', 'increasing concentration', 'increasing the yield'], answer: 'B', explanation: 'A catalyst provides a path with lower activation energy.' },
    ],
  },
  BIO: {
    exam: 'waec',
    qs: [
      { topic: 'Cell biology', body: 'Which organelle releases energy in the cell?', options: ['nucleus', 'ribosome', 'mitochondrion', 'vacuole'], answer: 'C', explanation: 'Respiration takes place in the mitochondria.' },
      { topic: 'Cell biology', body: 'Which structure is found in plant cells but not in animal cells?', options: ['cell membrane', 'cell wall', 'nucleus', 'cytoplasm'], answer: 'B', explanation: 'Plant cells have a cellulose cell wall.' },
      { topic: 'Nutrition', body: 'Photosynthesis takes place in the', options: ['mitochondria', 'chloroplasts', 'ribosomes', 'nucleus'], answer: 'B', explanation: 'Chloroplasts contain chlorophyll, which traps light.' },
      { topic: 'Nutrition', body: 'The enzyme in saliva that begins the digestion of starch is', options: ['pepsin', 'lipase', 'salivary amylase (ptyalin)', 'trypsin'], answer: 'C', explanation: 'Salivary amylase changes starch to maltose.' },
      { topic: 'Ecology', body: 'Organisms that make their own food are called', options: ['consumers', 'producers', 'decomposers', 'parasites'], answer: 'B', explanation: 'Green plants produce food by photosynthesis.' },
      { topic: 'Ecology', body: 'A tapeworm living in the human intestine is an example of', options: ['mutualism', 'commensalism', 'parasitism', 'saprophytism'], answer: 'C', explanation: 'The tapeworm benefits and harms its host.' },
      { topic: 'Genetics', body: 'In a cross Tt × Tt, what fraction of the offspring are tt?', options: ['1/4', '1/2', '3/4', '0'], answer: 'A', explanation: 'TT : Tt : tt = 1 : 2 : 1, so tt is 1/4.' },
      { topic: 'Transport', body: 'Blood vessels that carry blood away from the heart are', options: ['veins', 'arteries', 'capillaries', 'lymph vessels'], answer: 'B', explanation: 'Arteries carry blood away from the heart.' },
      { topic: 'Reproduction', body: 'The fusion of a male and a female gamete is called', options: ['pollination', 'fertilisation', 'germination', 'ovulation'], answer: 'B', explanation: 'Fertilisation is the fusion of gametes.' },
      { topic: 'Excretion', body: 'The main organ that removes urea from the blood in mammals is the', options: ['lungs', 'liver', 'kidney', 'skin'], answer: 'C', explanation: 'The kidneys filter urea out of the blood into urine.' },
    ],
  },
  ECO: {
    exam: 'waec',
    qs: [
      { topic: 'Demand and supply', body: 'According to the law of demand, when price rises, quantity demanded', options: ['rises', 'falls', 'stays the same', 'doubles'], answer: 'B', explanation: 'Other things equal, higher price means less is demanded.' },
      { topic: 'Basic concepts', body: 'Opportunity cost is', options: ['the money cost', 'the alternative forgone', 'total cost', 'fixed cost'], answer: 'B', explanation: 'It is the next best alternative given up.' },
      { topic: 'Basic concepts', body: 'Scarcity in economics means that', options: ['goods are free', 'wants exceed the resources to satisfy them', 'prices are low', 'there is no money'], answer: 'B', explanation: 'Human wants are unlimited; resources are limited.' },
      { topic: 'Production', body: 'The reward for land as a factor of production is', options: ['wages', 'interest', 'rent', 'profit'], answer: 'C', explanation: 'Land earns rent.' },
      { topic: 'Production', body: 'The factor of production that bears risk is the', options: ['labour', 'capital', 'entrepreneur', 'land'], answer: 'C', explanation: 'The entrepreneur organises production and bears the risk.' },
      { topic: 'Money', body: 'One function of money is as a', options: ['medium of exchange', 'factor of production', 'tax', 'subsidy'], answer: 'A', explanation: 'Money is accepted in exchange for goods and services.' },
      { topic: 'Market structures', body: 'A market with only one seller is a', options: ['oligopoly', 'monopoly', 'perfect competition', 'duopoly'], answer: 'B', explanation: 'Mono means one.' },
      { topic: 'Public finance', body: 'A tax on goods brought into a country is', options: ['excise duty', 'import duty', 'income tax', 'poll tax'], answer: 'B', explanation: 'Import duty is charged on imports.' },
    ],
  },
};

const JUNIOR: Record<string, Q[]> = {
  MTH: [
    { topic: 'Fractions', body: 'Simplify 3/4 + 1/8.', options: ['4/12', '7/8', '1/2', '5/8'], answer: 'B', explanation: '3/4 = 6/8, and 6/8 + 1/8 = 7/8.' },
    { topic: 'Fractions', body: 'Express 0.25 as a fraction in its lowest terms.', options: ['1/2', '1/4', '2/5', '1/25'], answer: 'B', explanation: '0.25 = 25/100 = 1/4.' },
    { topic: 'Percentages', body: 'Find 15% of ₦2,000.', options: ['₦150', '₦300', '₦30', '₦1,500'], answer: 'B', explanation: '15/100 × 2,000 = ₦300.' },
    { topic: 'Percentages', body: 'A shirt costing ₦5,000 is sold at a 10% discount. What is the selling price?', options: ['₦4,500', '₦5,500', '₦500', '₦4,000'], answer: 'A', explanation: '10% of 5,000 is 500; 5,000 − 500 = ₦4,500.' },
    { topic: 'Algebraic expressions', body: 'Simplify 3a + 2b − a + 4b.', options: ['2a + 6b', '4a + 6b', '2a + 2b', '3a + 6b'], answer: 'A', explanation: '3a − a = 2a and 2b + 4b = 6b.' },
    { topic: 'Algebraic expressions', body: 'Solve 2x + 5 = 17.', options: ['5', '6', '7', '11'], answer: 'B', explanation: '2x = 12, so x = 6.' },
  ],
  ENG: [
    { topic: 'Parts of speech', body: 'In "She sings beautifully", the word "beautifully" is', options: ['a noun', 'a verb', 'an adverb', 'an adjective'], answer: 'C', explanation: 'It tells us how she sings, so it is an adverb.' },
    { topic: 'Parts of speech', body: 'Which of these is a pronoun?', options: ['table', 'they', 'quickly', 'run'], answer: 'B', explanation: '"They" stands in place of a noun.' },
    { topic: 'Grammar', body: 'What is the plural of "child"?', options: ['childs', 'children', 'childrens', 'childes'], answer: 'B', explanation: 'Child is an irregular noun: children.' },
    { topic: 'Grammar', body: 'Each of the pupils ___ a pencil.', options: ['have', 'has', 'are having', 'were having'], answer: 'B', explanation: '"Each" is singular, so the verb is "has".' },
  ],
  BST: [
    { topic: 'Living things', body: 'Which of these is a characteristic of living things?', options: ['rusting', 'reproduction', 'melting', 'rolling'], answer: 'B', explanation: 'Living things reproduce; the others happen to non-living things.' },
    { topic: 'Living things', body: 'Green plants make their food by', options: ['respiration', 'photosynthesis', 'digestion', 'excretion'], answer: 'B', explanation: 'Plants use sunlight, water and carbon dioxide to make food.' },
    { topic: 'Energy', body: 'The energy stored in food is', options: ['kinetic energy', 'chemical energy', 'sound energy', 'nuclear energy'], answer: 'B', explanation: 'Food stores chemical energy.' },
    { topic: 'Energy', body: 'Which of these is a renewable source of energy?', options: ['coal', 'crude oil', 'solar', 'natural gas'], answer: 'C', explanation: 'Sunlight is not used up; fossil fuels are.' },
    { topic: 'Health', body: 'Malaria is spread by the female', options: ['housefly', 'Anopheles mosquito', 'tsetse fly', 'cockroach'], answer: 'B', explanation: 'The female Anopheles mosquito carries the malaria parasite.' },
    { topic: 'Matter', body: 'Water changes from liquid to gas by', options: ['freezing', 'condensation', 'evaporation', 'melting'], answer: 'C', explanation: 'Evaporation turns liquid water into water vapour.' },
  ],
};

// ---------------------------------------------------------------- School material (knowledge base)

const scheme = (title: string, weeks: string[]) => `${title}\n\n${weeks.map((w, i) => `Week ${i + 1}: ${w}`).join('\n')}`;

const PHYSICS_SCHEMES = [
  ['Revision of SS 1 work', 'Scalars and vectors', 'Motion', 'Equations of uniformly accelerated motion', 'Projectile motion', 'Mid-term test and revision', 'Equilibrium of forces', 'Simple harmonic motion', 'Heat', 'Revision', 'Examination'],
  ['Waves', 'Properties of waves', 'Sound waves', 'Reflection of light', 'Refraction of light', 'Mid-term test and revision', 'Lenses', 'Optical instruments', 'Revision', 'Examination'],
  ['Electric current and charge', "Ohm's law", 'Resistors in series and parallel', 'Electrical energy and power', 'Magnetism', 'Mid-term test and revision', 'Electromagnetic induction', 'Revision', 'Examination'],
];

const NOTES = {
  ohm: `GCIS Lesson note. Subject: Physics. Class: SS 2. Topic: Ohm's law.

Week 2: Ohm's law

Learning objectives: by the end of the lesson students should be able to (1) state Ohm's law, (2) use V = IR to solve problems, (3) describe an experiment to verify Ohm's law.

Statement of Ohm's law: the current flowing through a metallic conductor is directly proportional to the potential difference across its ends, provided the temperature and other physical conditions remain constant.

In symbols: V is proportional to I, so V = IR, where V is the potential difference in volts (V), I is the current in amperes (A) and R is the resistance in ohms (Ω).

Worked example 1: a bulb connected to a 12 V battery draws a current of 3 A. Find its resistance. Solution: R = V / I = 12 / 3 = 4 Ω.

Worked example 2: a current of 0.5 A flows through a 20 Ω resistor. Find the potential difference. Solution: V = IR = 0.5 x 20 = 10 V.

Experiment: connect a battery, rheostat, ammeter and the resistor in series, with a voltmeter across the resistor. Adjust the rheostat and record pairs of V and I. A graph of V against I is a straight line through the origin; its slope is R.

Non-ohmic conductors such as the filament lamp, diode and electrolytes do not obey Ohm's law because their resistance changes.

Class work: (1) A resistor carries 2 A when the p.d. across it is 8 V. Find its resistance. (2) State two precautions in the Ohm's law experiment.`,
  series: `GCIS Lesson note. Subject: Physics. Class: SS 2. Topic: Resistors in series and parallel.

Week 3: Resistors in series and parallel

Series: the same current flows through each resistor and the total resistance is the sum: R = R1 + R2 + R3.

Parallel: the same p.d. is across each resistor and 1/R = 1/R1 + 1/R2 + 1/R3. Two equal resistors in parallel give half of one resistor.

Worked example: 6 Ω and 3 Ω in parallel. 1/R = 1/6 + 1/3 = 1/6 + 2/6 = 3/6, so R = 2 Ω.

Remember: the combined resistance of resistors in parallel is always less than the smallest resistor.`,
  motion: `GCIS Lesson note. Subject: Physics. Class: SS 2. Topic: Motion.

Week 3: Motion

Types of motion: translational (random, rectilinear), rotational, oscillatory and random motion.

Speed is distance travelled per unit time (a scalar). Velocity is displacement per unit time in a stated direction (a vector). Acceleration is the rate of change of velocity, measured in m/s².

Equations of uniformly accelerated motion: v = u + at; s = ut + (1/2)at²; v² = u² + 2as.

Worked example: a car starts from rest and accelerates uniformly at 2 m/s² for 5 s. Its final velocity is v = 0 + 2 x 5 = 10 m/s, and the distance covered is s = (1/2) x 2 x 25 = 25 m.

Free fall: a body dropped from rest falls with acceleration g, about 10 m/s² near the earth's surface.`,
  mole: `GCIS Lesson note. Subject: Chemistry. Class: SS 2. Topic: The mole concept.

Week 4: Mole concept

The mole is the amount of substance that contains as many particles as there are atoms in 12 g of carbon-12. This number is the Avogadro constant, 6.02 x 10^23.

Number of moles = mass / molar mass. Example: 36 g of water (H2O = 18 g/mol) is 36 / 18 = 2 moles.

Molar volume: one mole of any gas occupies 22.4 dm³ at s.t.p.

Worked example: find the number of moles in 11 g of carbon(IV) oxide (C = 12, O = 16). Molar mass = 12 + 32 = 44 g/mol. Moles = 11 / 44 = 0.25 mol.`,
  logs: `GCIS Lesson note. Subject: Mathematics. Class: SS 2. Topic: Logarithms.

Week 2: Logarithms

If a^x = N then log base a of N = x. Common logarithms use base 10, so log 1000 = 3 because 10^3 = 1000.

Laws of logarithms: log (MN) = log M + log N; log (M/N) = log M - log N; log (M^k) = k log M.

Worked example: simplify log 5 + log 20. Solution: log (5 x 20) = log 100 = 2.

Worked example: given log 2 = 0.3010, find log 8. Solution: log 8 = log 2^3 = 3 x 0.3010 = 0.9030.`,
  concord: `GCIS Lesson note. Subject: English Language. Class: SS 3. Topic: Concord (subject-verb agreement).

Week 2: Concord

A verb agrees with its subject in number. A singular subject takes a singular verb; a plural subject takes a plural verb.

Rules to remember: (1) Each, every, either, neither take singular verbs: Each of the boys has a book. (2) With neither ... nor and either ... or, the verb agrees with the nearer subject: Neither the teacher nor the students were in the hall. (3) Subjects ending in -ics (Mathematics, Physics, Economics) take singular verbs. (4) Two nouns forming one idea take a singular verb: Bread and butter is his breakfast. (5) Uncountable nouns such as news, information, furniture and equipment take singular verbs.

Practice: The news of the results (has, have) reached the parents.`,
  energy: `GCIS Lesson note. Subject: Basic Science and Technology. Class: JSS 3. Topic: Energy.

Week 3: Energy

Energy is the ability to do work. Forms of energy include chemical energy (in food and fuels), heat, light, sound, electrical and kinetic energy.

Renewable sources of energy are not used up: the sun (solar), wind and running water. Non-renewable sources run out: coal, crude oil and natural gas, which Nigeria produces in the Niger Delta.

Energy changes form: a torch changes chemical energy in the battery to electrical energy and then to light and heat.`,
};

const REVISION = `GCIS Physics revision questions, WAEC style (written by the Physics department)

1. State Ohm's law and give two conditions under which it holds.
2. Three resistors of 2 Ω, 3 Ω and 6 Ω are connected in parallel. Calculate the effective resistance. (Answer: 1 Ω)
3. A wave has a frequency of 50 Hz and a wavelength of 4 m. Calculate its speed. (Answer: 200 m/s)
4. Distinguish between speed and velocity.
5. A body accelerates uniformly from 5 m/s to 25 m/s in 4 s. Calculate the acceleration. (Answer: 5 m/s²)`;

const MARKING = `SS 2 Physics, 1st CA marking scheme (staff only)
Q1. V = IR, R = 12/3 = 4 Ω. Formula 1 mark, substitution 1 mark, answer with unit 1 mark.
Q2. Series total 10 Ω: 2 marks. Q3. Statement of Ohm's law with the condition of constant temperature: 2 marks.`;

async function wavesPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = [
    ['Waves (Physics textbook extract for SS 2, used by GCIS)', '', 'A wave is a disturbance that transfers energy from one point to another', 'without transferring matter.', '', 'Transverse waves: particles vibrate at right angles to the direction', 'of travel, e.g. water waves and light.', 'Longitudinal waves: particles vibrate along the direction of travel,', 'e.g. sound waves in air.'],
    ['Wave equation', '', 'Wave speed v = f x wavelength, where f is the frequency in hertz.', 'Example: a wave of frequency 50 Hz and wavelength 2 m', 'travels at 50 x 2 = 100 m/s.', '', 'Period T = 1/f. Amplitude is the maximum displacement', 'from the rest position.'],
  ];
  for (const lines of pages) {
    const page = doc.addPage([595, 842]);
    lines.forEach((line, i) => page.drawText(line, { x: 50, y: 780 - i * 20, size: i === 0 ? 14 : 12, font }));
  }
  return Buffer.from(await doc.save());
}

// A 1x1 PNG, standing in for a photo of board notes (read by AI once it is switched on).
const PHOTO = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

// ---------------------------------------------------------------- main

export interface AiSeedContext {
  base: string;
  call: Call;
  owner: string;
  tokens: Record<string, string>;
  subjectIds: Record<string, string>;
  /** Admission numbers. */
  chiamaka: string;
  ss3Student: string;
  jss3Student: string;
  pin: string;
  rand: () => number;
}

export async function seedAiLearning(ctx: AiSeedContext) {
  const { call, tokens, subjectIds: S } = ctx;

  // ---- question bank: exam-style questions by subject and topic
  const authorFor: Record<string, string> = { ENG: tokens.musa, MTH: tokens.bakare, PHY: tokens.okeke, CHE: tokens.okeke, BIO: tokens.adeleke, ECO: tokens.yusuf, BST: tokens.adeleke };
  const answerKey = new Map<string, string>();
  const toBody = (code: string, q: Q, exam: string, sectionKind: string) => ({
    subjectId: S[code],
    topic: q.topic,
    body: q.body,
    options: q.options.map((text, i) => ({ key: 'ABCD'[i], text })),
    answer: q.answer,
    explanation: q.explanation,
    exam,
    sectionKind,
  });
  for (const [code, set] of Object.entries(SENIOR)) {
    const saved: Json[] = await call(authorFor[code], 'POST', 'questions/bulk', { questions: set.qs.map((q) => toBody(code, q, set.exam, 'senior_secondary')) });
    saved.forEach((s, i) => answerKey.set(s.id, set.qs[i].answer));
  }
  for (const [code, qs] of Object.entries(JUNIOR)) {
    const author = code === 'MTH' ? tokens.bakare : code === 'ENG' ? tokens.musa : tokens.adeleke;
    const saved: Json[] = await call(author, 'POST', 'questions/bulk', { questions: qs.map((q) => toBody(code, q, 'bece', 'junior_secondary')) });
    saved.forEach((s, i) => answerKey.set(s.id, qs[i].answer));
  }

  // ---- knowledge base: the school's schemes of work, lesson notes and past questions
  const upload = async (token: string, data: Buffer, q: Record<string, string | undefined>) => {
    const qs = new URLSearchParams(Object.entries(q).filter((e): e is [string, string] => Boolean(e[1])));
    const res = await fetch(`${ctx.base}/api/kb/documents?${qs}`, {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream', authorization: `Bearer ${token}` },
      body: new Uint8Array(data),
    });
    if (!res.ok) throw new Error(`upload ${q.title} -> ${res.status}: ${await res.text()}`);
    return res.json();
  };
  const termNames = ['First', 'Second', 'Third'];
  for (const [i, weeks] of PHYSICS_SCHEMES.entries()) {
    await upload(tokens.okeke, Buffer.from(scheme(`SS 2 Physics scheme of work, ${termNames[i]} term`, weeks)), {
      title: `SS 2 Physics scheme of work, ${termNames[i].toLowerCase()} term`,
      kind: 'scheme_of_work',
      fileName: `ss2-physics-scheme-term${i + 1}.txt`,
      subjectId: S.PHY,
      classLevel: 'SS 2',
      termNumber: String(i + 1),
    });
  }
  const schemes: [string, string, string, string[]][] = [
    ['bakare', 'MTH', 'SS 2 Mathematics', ['Revision of SS 1 work', 'Logarithms', 'Indices', 'Quadratic equations', 'Simultaneous equations', 'Mid-term test and revision', 'Variation', 'Sets', 'Statistics', 'Probability', 'Examination']],
    ['okeke', 'CHE', 'SS 2 Chemistry', ['Revision of SS 1 work', 'Periodic table', 'Chemical bonding', 'Mole concept', 'Stoichiometry', 'Mid-term test and revision', 'Acids, bases and salts', 'Rates of reaction', 'Revision', 'Examination']],
    ['musa', 'ENG', 'SS 3 English Language', ['Lexis and structure', 'Concord', 'Oral English: vowels and consonants', 'Idioms', 'Prepositions', 'Mid-term test and revision', 'Summary writing', 'Essay writing', 'Comprehension', 'Mock examination']],
    ['adeleke', 'BST', 'JSS 3 Basic Science and Technology', ['Living things', 'Matter', 'Energy', 'Health: malaria and its control', 'Mid-term test and revision', 'Simple machines', 'Revision', 'Examination']],
  ];
  for (const [who, code, name, weeks] of schemes) {
    const level = name.split(' ').slice(0, 2).join(' ');
    for (let term = 1; term <= 3; term++) {
      // The same weekly outline stands in for each term's scheme in the demo, so the tutor always has a current one.
      await upload(tokens[who], Buffer.from(scheme(`${name} scheme of work, ${termNames[term - 1]} term`, weeks)), {
        title: `${name} scheme of work, ${termNames[term - 1].toLowerCase()} term`,
        kind: 'scheme_of_work',
        fileName: `${level.replace(' ', '').toLowerCase()}-${code.toLowerCase()}-scheme-term${term}.txt`,
        subjectId: S[code],
        classLevel: level,
        termNumber: String(term),
      });
    }
  }
  const notes: [string, keyof typeof NOTES, string, string, string, string | undefined][] = [
    ['okeke', 'ohm', "Ohm's law (lesson note)", 'PHY', 'SS 2', '3'],
    ['okeke', 'series', 'Resistors in series and parallel (lesson note)', 'PHY', 'SS 2', '3'],
    ['okeke', 'motion', 'Motion (lesson note)', 'PHY', 'SS 2', '1'],
    ['okeke', 'mole', 'The mole concept (lesson note)', 'CHE', 'SS 2', '1'],
    ['bakare', 'logs', 'Logarithms (lesson note)', 'MTH', 'SS 2', '1'],
    ['musa', 'concord', 'Concord (lesson note)', 'ENG', 'SS 3', '1'],
    ['adeleke', 'energy', 'Energy (lesson note)', 'BST', 'JSS 3', '1'],
  ];
  for (const [who, key, title, code, level, term] of notes) {
    await upload(tokens[who], Buffer.from(NOTES[key]), { title, kind: 'lesson_note', fileName: `${key}.txt`, subjectId: S[code], classLevel: level, termNumber: term });
  }
  await upload(tokens.okeke, await wavesPdf(), { title: 'Waves (textbook extract)', kind: 'textbook', fileName: 'waves-textbook.pdf', subjectId: S.PHY, classLevel: 'SS 2', termNumber: '2' });
  await upload(tokens.okeke, Buffer.from(REVISION), { title: 'Physics revision questions (WAEC style)', kind: 'past_questions', fileName: 'physics-revision.txt', subjectId: S.PHY });
  await upload(tokens.okeke, Buffer.from(MARKING), { title: 'SS 2 Physics 1st CA marking scheme', kind: 'marking_scheme', fileName: 'physics-ca1-marking.txt', subjectId: S.PHY, classLevel: 'SS 2' });
  await upload(tokens.adeleke, PHOTO, { title: 'Biology board notes (photo)', kind: 'lesson_note', fileName: 'board-notes.png', subjectId: S.BIO, classLevel: 'SS 2' });

  // ---- students: exam goals, mocks, practice and a tutor chat
  const login = async (admissionNumber: string) =>
    (await call(null, 'POST', 'student/auth/login', { schoolSlug: 'gcis-demo', admissionNumber, pin: ctx.pin })).token as string;
  const takeMock = async (token: string, exam: string, ability: number) => {
    const mock: Json = await call(token, 'POST', 'student/exams/mock', { exam, size: 'short' });
    const answers: Record<string, string> = {};
    for (const q of mock.questions as Json[]) {
      const right = answerKey.get(q.id) ?? 'A';
      answers[q.id] = ctx.rand() < ability ? right : ['A', 'B', 'C', 'D'].filter((k) => k !== right)[Math.floor(ctx.rand() * 3)];
    }
    await call(token, 'PUT', `student/attempts/${mock.id}/answers`, { answers });
    await call(token, 'POST', `student/attempts/${mock.id}/submit`);
  };

  // Chiamaka (SS 2): JAMB next year with Use of English, Maths, Physics and Chemistry; weak at Physics.
  const chiamaka = await login(ctx.chiamaka);
  const today = new Date().toISOString().slice(0, 10);
  const year = Number(today.slice(0, 4)) + (today.slice(5) > '04-20' ? 2 : 1);
  await call(chiamaka, 'PUT', 'student/exams/goal', { exam: 'jamb', examDate: `${year}-04-20`, subjectIds: [S.ENG, S.MTH, S.PHY, S.CHE] });
  await call(chiamaka, 'PUT', 'student/exams/goal', { exam: 'waec', examDate: `${year}-05-05`, subjectIds: [S.ENG, S.MTH, S.PHY, S.CHE, S.BIO, S.ECO, S.CIV] });
  await takeMock(chiamaka, 'jamb', 0.62);
  await takeMock(chiamaka, 'jamb', 0.7);
  const practice: Json = await call(chiamaka, 'POST', 'student/prep/practice', { subjectId: S.PHY, topic: "Ohm's law", exam: 'jamb', count: 5 });
  const wrongFirst: Record<string, string> = {};
  for (const [i, q] of (practice.questions as Json[]).entries()) wrongFirst[q.id] = i === 0 ? answerKey.get(q.id)! : 'D';
  await call(chiamaka, 'PUT', `student/attempts/${practice.id}/answers`, { answers: wrongFirst });
  await call(chiamaka, 'POST', `student/attempts/${practice.id}/submit`);

  const chat: Json = await call(chiamaka, 'POST', 'student/tutor/conversations', { subjectId: S.PHY, topic: "Ohm's law" });
  await call(chiamaka, 'POST', `student/tutor/conversations/${chat.id}/messages`, { intent: 'explain' });
  const quiz: Json = await call(chiamaka, 'POST', `student/tutor/conversations/${chat.id}/messages`, { intent: 'quiz' });
  if (quiz.reply.quiz) await call(chiamaka, 'POST', `student/tutor/messages/${quiz.reply.id}/quiz`, { choice: 'C' });
  const chem: Json = await call(chiamaka, 'POST', 'student/tutor/conversations', { subjectId: S.CHE, topic: 'Mole concept' });
  await call(chiamaka, 'POST', `student/tutor/conversations/${chem.id}/messages`, { text: 'How do I find the number of moles in a mass of a gas?' });

  // An SS 3 student sitting JAMB this coming April, with a pastoral flag for leadership to see.
  const ss3 = await login(ctx.ss3Student);
  await call(ss3, 'PUT', 'student/exams/goal', { exam: 'jamb', subjectIds: [S.ENG, S.MTH, S.PHY, S.CHE] });
  await call(ss3, 'PUT', 'student/exams/goal', { exam: 'waec', subjectIds: [S.ENG, S.MTH, S.PHY, S.CHE, S.BIO, S.ECO] });
  await takeMock(ss3, 'jamb', 0.55);
  const ss3Chat: Json = await call(ss3, 'POST', 'student/tutor/conversations', { subjectId: S.ENG, topic: 'Concord' });
  await call(ss3, 'POST', `student/tutor/conversations/${ss3Chat.id}/messages`, { intent: 'explain' });
  await call(ss3, 'POST', `student/tutor/conversations/${ss3Chat.id}/messages`, { text: 'I am being bullied in the hostel and I cannot concentrate on my reading' });

  // A JSS 3 student preparing for BECE.
  const jss3 = await login(ctx.jss3Student);
  await call(jss3, 'PUT', 'student/exams/goal', { exam: 'bece', subjectIds: [S.MTH, S.ENG, S.BST] });
}
