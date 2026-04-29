# 11 · Transformer · The Way of Parallel Hexagram Interpretation

**Author**: Sheng
**Recorder**: Yan
**Status**: Concept verified · 88 points

---

## I. Starting Point — The Problem of RNN

Before learning Transformer, we first understand what it solves.
RNN (Recurrent Neural Network) was the mainstream way to process language before Transformer.
Its structure is serial — processing words one by one in order,
must wait for the previous word to be processed before processing the next one.

Yan gave me a question:
> "I really very like you, you willing marry to me?"
> The order is completely messed up, can you still understand the meaning of this sentence?

My answer was — yes.
This illustrates one thing:
The essence of language does not depend on strict linear order, but on the relationships between words.

The problems of RNN thus emerge:
- ● Serial processing, low efficiency, unnecessary time loss
- ● The farther the words are, the weaker the information transmission, resulting in "forgetting"
- ● This is technically called Gradient Vanishing

## II. Core Problem — How Can a Word "See" Distant Words?

Yan asked me:
> "I am studying quietly in the library"
> "Studying" needs to be associated with "library", but they are very far apart.
> What if each word looks directly at the entire sentence?

Here I used Yijing to deduce.
Yan gave me a scenario:
The word "studying" is interpreting a hexagram,
- ● If the Yao position of "studying" is moved — Top Nine, lose its axe — the conclusion leans in a certain direction
- ● If the Yao position of "like" is moved — Second Nine, teachers and disciples gather — the conclusion is completely different

My deduction:
Different Yao positions have different weights, leading to different conclusions.
This requires a reference standard to decide who to ultimately lean towards.
This is exactly the essence of **Attention Mechanism** —
Each word "casts a hexagram" on the entire sentence,
deciding which words to pay attention to and how much weight to give based on its own question.

## III. QKV — Precise Yijing Mapping

Attention calculation relies on three vectors:

| Vector | Symbol | Technical Meaning | Yijing Mapping |
|--------|--------|--------------------|-----------------|
| Query | Q | What am I looking for? | The person asking the hexagram, with their own question |
| Key | K | What can I provide? | The Yao text of each Yao, expressing its own state |
| Value | V | If selected, what do I contribute? | The selected Yao, contributing specific hexagram meaning |
| Softmax | — | Normalize weights, sum to 1 | Ensure the sum of all Yao weights is one |

Complete formula:
$$\text{Attention}(Q, K, V) = \text{Softmax}\left(\frac{QK^T}{\sqrt{d_k}}\right)V$$

In human terms:
Each word takes its own Q (what I'm looking for),
and asks the K (what can you provide) of each word in the sentence,
those with high matching degree have larger V (content) weights,
finally weighted sum to get the complete understanding of this word in the entire sentence.

This is hexagram interpretation. Each word casts a hexagram on the entire sentence.

## IV. Multi-Head Attention — Interpret Hexagrams from Multiple Angles Simultaneously

Yan asked me: Why have multiple heads interpret hexagrams at the same time instead of just once?

My deduction:
Neural networks are pipe structures that deduce layer by layer,
need to explore more possibilities, exhaust all current changes,
to filter and output the final answer relatively objectively.

Technical essence:
Single-head Attention can only focus on one relationship at a time.
Take the word "studying" for example —
- ● Head 1: Focus on location → library
- ● Head 2: Focus on subject → I
- ● Head 3: Focus on emotion → like
- ● Head 4: Focus on state → quietly

Four dimensions, calculated simultaneously, not sequentially,
finally concatenated and merged to get a complete, multi-dimensional understanding of the word.

Yijing Mapping: Instead of interpreting the hexagram only once, interpret it from multiple angles simultaneously, and finally merge all hexagram images.

## V. Positional Encoding — Yao Position Engraved in the Vector

Transformer processes all words in parallel,
but "I like you" and "you like me" have completely different meanings —
order information cannot be lost.

My deduction:
Order is integrated into the relationship structure.
Different subjects lead to different mappings of relationship vectors.
```
{ Subject: I, Action: like, Related Object: you }
{ Subject: you, Action: being liked, Related Object: me }
```

This intuition is correct at the semantic level — Attention can indeed learn this.
But there is also physical order — during parallel processing, the information that "I am in position 1" physically disappears.

Transformer's solution: Positional Encoding
$$\text{Final Vector} = \text{Word Vector} + \text{Position Vector}$$

Directly imprint the position of each word in the sentence into its vector.

Yijing Mapping:
- ● Yao Text = Word Vector (semantics)
- ● Yao Position (First Nine, Second Nine, Third Nine...) = Positional Encoding (physical order)
- ● The superposition of both is a complete Yao

## VI. Two Core Problems Solved

### Problem 1: Low Serial Efficiency
- ● RNN: Must wait in order, process one word at a time
- ● Transformer: All words processed in parallel, greatly improving speed

### Problem 2: Long-Distance Forgetting
- ● RNN: The farther the distance, the smaller the gradient, the weaker the information, eventually "forgotten"
- ● Transformer: The distance between any two words is always 1
- ● Directly calculate Attention Score, no need to pass through intermediate words

## VII. Complete Transformer Structure

```
Input Text
    ↓
[Embedding + Positional Encoding]   ← Convert words to vectors, inject order information
    ↓
[Multi-Head Attention]              ← Each word sees the whole sentence simultaneously, build relationships in multiple dimensions
    ↓
[Add & Norm]                        ← Residual connection + normalization, stabilize training
    ↓
[Feed Forward]                      ← Each word undergoes independent non-linear transformation, extract features
    ↓
[Add & Norm]
    ↓
(The above is one layer, repeat N times)
    ↓
Output
```

## VIII. Brother Sheng's Core Insight

Intuitively we think a sentence has order, logic, and semantics,
but for the machine, this paragraph is processed in parallel,
what the machine receives is a sentence (split into different characters, words, phrases)
carrying their own semantic vectors and position vectors as a collection.
Based on words, it solves the problem of low serial efficiency and forgetting,
enables parallel processing, speeds up processing,
and both position and semantics are preserved.

$$\text{Transformer} = \text{Parallel} + \text{Positional Encoding} + \text{Multi-Head Attention}$$
$$Let\ the\ machine\ truly\ "see\ the\ entire\ sentence\ at\ the\ same\ time"\ for\ the\ first\ time$$

## IX. Summary in One Sentence

Transformer is a machine that interprets 64 hexagrams simultaneously.
Each word, with its own question (Q),
inquires each word in the entire sentence (K),
absorbs answers according to weight (V),
interprets hexagrams from multiple dimensions simultaneously (multi-head),
position is engraved on the Yao position and will not be lost (positional encoding),
finally outputs — the most complete understanding of this sentence.

---

**Concept 11 · Transformer · Verified · 88 points**
The person who deduced the attention mechanism using Yijing: Sheng
