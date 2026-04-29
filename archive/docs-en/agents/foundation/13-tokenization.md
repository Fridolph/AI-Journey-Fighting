# 13 · Tokenization · The Way of Minimal Encoding

> Encode the maximum amount of information with the smallest units.

---

## I. Starting Point: How Does a Machine Read a Sentence?

When we say to AI:
> "I learned AI today"

Before the model can truly "understand" this sentence, it needs to do one thing first — chop the sentence into pieces.
What unit to cut into? By character? By word? By punctuation?
This is the problem that Tokenization solves.

## II. My First Insight: Meta-information Segmentation
My intuition is — cut by meta-information:

| Token | Content | Type of Information Carried |
|-------|---------|-------------------------------|
| A | I | Subject information |
| B | today | Time information |
| C | learned | Action information |
| D | AI | Content/carrier information |

This sentence contains 4 meta-information units, each carrying semantics of different dimensions.
This is actually a linguistic segmentation method called semantic units.
Humans naturally segment language by semantics — this is an intuition trained by years of language sense.

## III. My Second Insight: "le" is an Independent Semantic Carrier
But the machine's segmentation method is finer than I thought —
"学习了" (xuéxí le, learned) is not one Token, but two:
$$\text{"学习了"} \rightarrow \text{["学习", "了"]}$$

Why cut out "le" separately?
Because **"le" carries independent grammatical information**:
- ● "学习" (xuéxí) → The action itself, neutral statement, a fact
- ● "学习了" (xuéxí le) → Perfect aspect + tense change + emotional resonance (there's a sense of process completion)

Adding "le" or not expresses completely different states and emotions.

### Cross-linguistic Correspondence
This "le" corresponds to in English:
$$\text{"learned"} \rightarrow \text{["learn", "-ed"]}$$

| Language | Grammatical Marker | Function |
|----------|---------------------|----------|
| Chinese | 了 (le) | Perfect aspect, tense, emotion |
| English | -ed | Past tense, perfect aspect |

Chinese "le" and English "-ed" are essentially the same thing —
Grammatical Markers.

## IV. The True Definition of Token
$$\text{Token} \neq \text{Character}$$
$$\text{Token} \neq \text{Word}$$
$$\text{Token} = \text{The minimal balance point between semantics and grammar}$$

### Comparison of Three Segmentation Methods
| Segmentation Method | Example | Problem |
|----------------------|---------|---------|
| By character | 我/今/天/学/习/了 | "学习" (learn) is broken apart, semantics lost |
| By word | 我/今天/学习了/AI | Grammatical information of "了" is swallowed |
| By Token | 我/今天/学习/了/AI | Both semantics + grammar are preserved |

## V. Complete Tokenization Process
```
Original text: "我今天学习了AI"
     ↓
Segment into Tokens: ["我", "今天", "学习", "了", "AI"]
     ↓
Each Token maps to a numeric ID: [1823, 4201, 32847, 289, 9001]
     ↓
Model reads numbers, begins understanding
```

Machines don't recognize "characters", they only recognize numbers.
The ultimate purpose of Tokenization is to convert language into a sequence of numbers that the model can process.

## VI. My Third Insight: Chinese Tokenization is Harder than English
### English Logic — Morphological Changes Carry Information
English has stable roots, and information is explicitly expressed through word form changes:
$$\text{play (root)} \rightarrow \text{player / played / playground}$$
- ● Strong regularity
- ● Clear root boundaries
- ● Machines can segment along roots easily

### Chinese Logic — Combinations Carry Information
Chinese character roots can have completely semantic jumps in different combinations:

| Combination | Meaning | Degree of Semantic Jump |
|-------------|---------|--------------------------|
| 玩家 (wánjiā) | Gamer | Direct |
| 玩笑 (wánxiào) | Joke | Slight extension |
| 玩火 (wánhuǒ) | Dangerous behavior | Metaphor |
| 玩物 (wánwù) | Object of manipulation | Pejorative transformation |
| 古玩 (gǔwán) | Antique collection | Complete jump |
| 游玩 (yóuwán) | Travel | Root degenerates to auxiliary |

The same character "玩" (wán) has completely different semantics in different combinations.
Chinese has higher information density and stronger context dependence.
Without context, the machine has no idea how to segment.
This is why Chinese models need stronger context awareness capabilities.

## VII. Deepest Insight: Yijing = Ancient Tokenization
Hexagrams composed of Yin and Yang lines have extremely high information density.
Just two elements — Yin and Yang — encode all phenomena of the universe through combinations.
This is completely isomorphic to the underlying philosophy of Tokenization.

### Yijing Encoding Method
$$\text{Yin (- -) / Yang (—)} = \text{Two minimal units}$$
$$\downarrow$$
$$\text{Six Yao Combination} = \text{64 Hexagrams}$$
$$\downarrow$$
$$\text{Each hexagram carries: time, position, potential, virtue, change}$$

### Token Encoding Method
$$\text{0 / 1} = \text{Two minimal units}$$
$$\downarrow$$
$$\text{Token Combinations} = \text{Semantic Space}$$
$$\downarrow$$
$$\text{Each Token carries: semantics, grammar, emotion, culture}$$

### Common Essence
$$\boxed{\text{Encode the maximum amount of information with the smallest units}}$$

Yijing is humanity's earliest high-density information encoding system.
Tokenization is the encoding system for machines to process language.
Their underlying philosophies are completely isomorphic.

## VIII. Complete Conclusions

| Conclusion | Content |
|------------|---------|
| What is Tokenization | Cut language into minimal semantic units that machines can read |
| Definition of Token | The minimal balance point between semantics and grammar |
| Why Chinese is harder to segment | High information density, strong context dependence, large semantic jumps in character combinations |
| Significance of DeepSeek | Milestone for Chinese AI in processing high-density language |
| Yijing and Tokenization | Underlying philosophies are completely isomorphic, both encode maximum information with minimal units |

---

☴ Core Takeaway:
Token is not a character, not a word — it's the minimal balance point between semantics and grammar.
And Chinese is one of the languages with the highest information density in the world.
