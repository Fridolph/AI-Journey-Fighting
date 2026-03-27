# 15 · Attention · The Way of Observing Changes and Finding Useful Yao

---

## I. Starting from the Limitations of Embedding
In Concept 14, each word has a fixed coordinate.
But the problem arises:
- "I took a bite of an apple" → Apple refers to fruit
- "Apple released a new phone" → Apple refers to technology brand

Same word, fixed coordinate, but completely different semantics.
Embedding cannot solve this problem.
$$\boxed{\text{Attention's task: Let vectors be dynamically adjusted based on context}}$$

## II. How Does Attention Work?
Each word "looks" at other words in the sentence,
then assigns an attention weight to each word:
$$\text{High weight} \rightarrow \text{Greater influence, vector is pulled in this direction}$$
$$\text{Low weight} \rightarrow \text{Little influence, basically ignored}$$

**Example**:
$$\text{"Apple" in sentence ①: Pulled toward fruit direction by "bite" and "mouthful"}$$
$$\text{"Apple" in sentence ②: Pulled toward brand direction by "released" and "phone"}$$

### Technical Principle: QKV Three Vectors
Attention calculation relies on three core vectors, which correspond exactly to the Yijing hexagram interpretation process we discussed earlier:
| Vector | Name | Function | Yijing Correspondence |
|--------|------|----------|------------------------|
| Q | Query | What information the current word is looking for | The person asking the hexagram, with a question |
| K | Key | What information other words can provide | The Yao text of each Yao, expressing its own attributes |
| V | Value | What the actual content of other words is | The specific meaning corresponding to the Yao |

Simple explanation of calculation process:
1. The current word takes its own Q (what I want to know)
2. Matches with the K (what information do you have) of each word in the sentence
3. The higher the matching degree, the greater the weight given to the V (your content) of this word
4. Weighted sum of all V gives the new vector of the current word in the current context

### Core Advantage: Solving Long-Distance Dependencies
In the RNN era, the farther the words are in a sentence, the weaker the information transmission (gradient vanishing), for example:
> "When I was traveling in Paris, France 3 years ago, I ate the most delicious ______"
> The answer "crepe" needs to be associated with "Paris, France", which are very far apart, and RNN easily forgets this.

Attention's benefit: The distance between any two words is always 1, directly calculate the correlation degree, no matter how many words are in between, information will not be lost.

### Intuitive Example of Attention Weights
Taking the sentence "I eat apples" as an example, the attention weight matrix for three words (higher value means stronger attention):
| | I | eat | apples |
|-----|-----|-----|--------|
| **I** | 0.8 | 0.1 | 0.1 |
| **eat** | 0.2 | 0.3 | 0.5 |
| **apples** | 0.1 | 0.6 | 0.3 |

We can see:
- "eat" pays most attention to "apples" (the object of the action)
- "apples" pays most attention to "eat" (the action being performed)
- This conforms to human language understanding logic

## III. Multi-Head Attention
Instead of looking from only one perspective, understand relationships from multiple angles simultaneously:

| Perspective | Relationship Focused On |
|-------------|--------------------------|
| Grammatical Relationship | Subject-verb-object structure |
| Semantic Relationship | Word meaning relevance |
| Coreference Relationship | What "it/he/she" refers to |

Multiple perspectives superimposed → More comprehensive understanding.

### Multi-Head Attention Working Example
Taking the translation of the sentence "我爱中国" to English "I love China" as an example, 4 attention heads focus on different relationships:
- Head 1 (Grammar Head): Focus on the grammatical structure of "I → Subject", "love → Predicate", "China → Object"
- Head 2 (Semantic Head): Focus on the emotional association between "love" and "China"
- Head 3 (Coreference Head): If the previous text mentions "my hometown", it will be associated with "China"
- Head 4 (Alignment Head): Focus on word alignment between Chinese "我爱中国" and English "I love China"

### Two Main Attention Types
| Type | Characteristics | Application Scenarios |
|------|-------------------|------------------------|
| Self-Attention | Words within the same sentence pay attention to each other | Understand the semantics of a single text segment |
| Cross-Attention | Words from two different sentences pay attention to each other | Generative tasks such as translation, question answering, summarization (input text and output text pay attention to each other) |

In actual Transformers, the Encoder only uses self-attention, while the Decoder uses both self-attention and cross-attention.

## IV. Yijing Mapping
| Yijing | Attention |
|--------|-----------|
| Finding the Useful Yao | Find the most critical word |
| Prosperity/Decline of Useful Yao | Attention weight level |
| Context determines the Useful Yao | Context determines weights |
| Image changes with context | Vector adjusts with context |

$$\boxed{\text{Finding the Useful Yao = Attention}}$$

## V. Embedding vs Attention
| Dimension | Embedding | Attention |
|-----------|-----------|-----------|
| Nature | Static | Dynamic |
| Function | Determining Image | Observing Changes |
| Characteristic | Fixed coordinate | Dynamic adjustment |

$$\text{Yijing says: There is movement within stillness, image changes with context}$$
$$\boxed{\text{Embedding determines the image, Attention observes the changes}}$$
