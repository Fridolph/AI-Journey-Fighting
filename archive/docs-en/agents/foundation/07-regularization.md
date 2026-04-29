# 07 · Regularization · The Way of Concentration and Refinement

**Learning Status**: Archived at 99 points · Self-deduced by Brother Sheng, perfect closure

---

## I. Core Definition (Brother Sheng's original words, 99 points archived)

> Regularization is an adjustment method for machine learning when overfitting occurs,
> by adding restrictions to the model (such as 3 pages of draft paper),
> forcing the machine to condense and refine,
> to achieve generalization — understand patterns, draw inferences from examples.

> Regularization is the solution to overfitting. By adding penalty terms to the Loss function, it limits the size of model weights, forcing the model to abandon memorizing noise and instead extract real patterns, improving generalization ability.

## II. Brother Sheng's Deduction Path

If a student wants to learn by rote memorization, they need question sets and books.
Now these are all gone, the content on the blackboard by the teacher is fixed,
only 3 pages of draft paper are given, these 3 pages are all he has.
If using rote memorization, it would take 30 pages,
now with only 3 pages, the content needs to be highly condensed and refined,
only then is it possible to get high scores.

| Brother Sheng's Analogy | Machine Correspondence |
|--------------------------|-------------------------|
| Takes 30 pages to memorize all questions | Large number of weights, can memorize every training sample |
| Only given 3 pages of draft paper | Limit the size or complexity of weights |
| Forced to highly condense and summarize | Model is forced to learn patterns instead of memorizing answers |
| Content written on 3 pages can handle new questions | Generalization ability improves |

$$Regularization = Artificially adding "draft paper limit" to the model$$

## III. Machine Implementation

### Core Formula
$$Loss_{regularized} = \underbrace{Cost\ of\ prediction\ error}_{Original\ Loss} + \underbrace{\lambda \cdot Weight\ magnitude}_{Newly\ added\ penalty\ term}$$

### Meaning of λ
$$\lambda = "Strictness"\ of\ the\ draft\ paper\ limit$$

| Value of λ | Effect |
|------------|--------|
| Large λ | Fewer draft pages, forcing higher level of generalization |
| Small λ | Slightly more draft pages, looser restrictions |
| λ = 0 | No restrictions, returns to rote memorization state |

## IV. Three Regularization Methods

### L2 Regularization (Most Commonly Used)
$$Penalty\ term = \lambda \cdot \sum w^2$$
- ● Penalizes large weights
- ● Makes all weights as small and dispersed as possible
- ● No single neuron "holds all the power"

### L1 Regularization
$$Penalty\ term = \lambda \cdot \sum |w|$$
- ● More aggressive
- ● Directly compresses unimportant weights to 0
- ● Equivalent to deleting unimportant neurons

$$L1 = Not\ just\ compressing\ draft\ paper,\ but\ directly\ crossing\ out\ unimportant\ content$$

### Dropout
$$Randomly\ turn\ off\ some\ neurons\ during\ each\ training$$

30 students memorizing questions together,
during each exam, randomly send 10 people home,
the remaining 20 must complete it independently.
This way no one can rely on others,
everyone must truly understand.

$$Dropout = Random\ absence,\ forcing\ each\ neuron\ to\ learn\ patterns\ independently$$

## V. Concept 07 Panorama

$$\underbrace{Regularization}_{Adding\ restrictions\ to\ the\ model} = Prevent\ rote\ memorization,\ force\ it\ to\ learn\ patterns$$
$$Method\ 1: L2 —— Reduce\ all\ weights$$
$$Method\ 2: L1 —— Delete\ unimportant\ weights$$
$$Method\ 3: Dropout —— Randomly\ turn\ off\ neurons$$
$$Core\ Formula: Loss_{regularized} = Loss_{original} + \lambda \cdot Weight\ penalty$$

## VI. Relationship with Concept 06

| Concept 06 · Overfitting | Concept 07 · Regularization |
|---------------------------|-------------------------------|
| Discovered the problem: rote memorization, no generalization | Provided the treatment: add restrictions, force generalization |
| Test set discovers the performance gap | Regularization prevents the gap from the source |
| Exam with new questions | Let the model itself learn to draw inferences |

$$Overfitting\ is\ the\ disease,\ regularization\ is\ the\ medicine$$

## VII. Growth Record

At Concept 01, Brother Sheng was understanding the analogies given by Yan.
At Concept 07, Brother Sheng is giving analogies to Yan.
The 3 pages of draft paper analogy is Brother Sheng's.
Not Yan's.

> "Maybe it's because I learned your way of learning,
> we resonate at the same frequency,
> the result is that I used the way we are familiar with,
> I hope there will be more and more such analogies."
> — Brother Sheng, Concept 07, 2026.03.02
