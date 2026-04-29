# 19 · RAG · The Way of Retrieving Classics Before Divination

---

## I. What Problem Does It Solve?
A model's training knowledge has a cutoff date.
After training is completed, the world continues to change, and the model doesn't know about new events.
Events that happened in 2024 are unknown to a model trained in 2023.
Internal enterprise documents have never been seen by the model.
$$\boxed{\text{RAG = Let the model consult external materials in real time when answering}}$$

## II. How Does RAG Work?
User asks a question
  ↓
① Retriever searches for relevant content in the external knowledge base
  ↓
② Insert the retrieved content into the Context Window
  ↓
③ Model generates answers combining retrieved content + training knowledge
  ↓
Output answer
$$\text{Retrieval} + \text{Augmented} + \text{Generation}$$

## III. Three Core Components of RAG
| Component | Function |
|-----------|----------|
| Knowledge Base | Stores external documents (PDF, web pages, databases...) |
| Retriever | Finds the most relevant fragments based on the question |
| Generator | The model itself, generates answers combined with retrieval results |

## IV. RAG vs Asking the Model Directly
| | Ask Model Directly | RAG |
|------|-------------------|-----|
| Knowledge Source | Training weights (fixed) | Training weights + real-time retrieval |
| Knowledge Timeliness | Has cutoff date | Updated in real time |
| Enterprise Private Data | ❌ Unknown | ✅ Can be retrieved |
| Hallucination Risk | Relatively high | Relatively low (sources can be traced) |

## V. Why Is RAG the Core Solution for Enterprise Implementation?
Enterprises cannot retrain the model every time there are new documents,
the cost is too high and the cycle is too long.
RAG's approach is:
$$\text{Unchanged Model} + \text{Knowledge Base Updated Anytime} = \text{Low Cost, High Timeliness}$$

## VI. Yijing Mapping
$$\text{RAG = Consulting classics before answering questions}$$
Instead of divining based on old knowledge in memory,
look up relevant classics on the spot,
then make judgments combined with the current hexagram.

## VII. Limitations
- ● Retrieval quality determines answer quality: Garbage in, garbage out
- ● Construction and maintenance of knowledge base requires cost
- ● Too much retrieved content may exceed the Context Window limit
$$\boxed{\text{RAG is not omnipotent, retrieval quality is the key}}$$

---

### Supplementary Learning: Life Analogy Understanding
RAG is essentially **open-book exam**:
- Ordinary model answering = Closed-book exam, can only use knowledge memorized in the brain, doesn't know outdated information, can't answer unseen questions
- RAG answering = Open-book exam, can look up materials anytime, then organize answers combined with own understanding, accurate and flexible

---

### Supplementary Learning: Common Implementation Levels of RAG
| Level | Characteristics | Applicable Scenarios |
|-------|-----------------|----------------------|
| Basic RAG | Retrieve → Insert into context → Generate, the most commonly used process | Most general scenarios |
| Advanced RAG | Re-rank after retrieval, put the most relevant content first, or summarize and simplify | Scenarios with long content requiring higher accuracy |
| Intelligent RAG | Automatically judge whether to retrieve: answer simple questions directly, retrieve only for complex questions | High-concurrency ToC products needing cost reduction |

---

### Supplementary Learning: Common RAG Applications Around You
You may be using RAG every day without realizing it:
1. **E-commerce customer service robots**: When asking about product parameters, the robot first checks the product manual before giving an accurate answer
2. **Enterprise internal assistants**: When asking about company reimbursement policies, first check the relevant chapters of the employee manual before explaining
3. **Document Q&A tools**: Upload a book/contract, ask about specific clauses, the robot first locates the relevant pages before summarizing the answer
4. **Learning assistants**: Ask about textbook knowledge points, first check the corresponding chapter content before giving examples and explanations

---

### Supplementary Learning: RAG vs Fine-tuning, How to Choose?
Many people confuse the difference between RAG and Fine-tuning, this table clarifies it:
| Comparison Item | RAG | Fine-tuning |
|-----------------|-----|-------------|
| Economic Cost | Very low, only need to maintain the knowledge base | Extremely high, requires GPU computing power and large amounts of training data |
| Time Cost | Real-time, adding files to the knowledge base takes effect immediately | Slow, training takes hours to days |
| Knowledge Update | Flexible, just add/delete/modify the knowledge base | Troublesome, requires retraining to update |
| Answer Traceability | ✅ Yes, can know which document and page the answer comes from | ❌ No, don't know which training data it comes from |
| Applicable Scenarios | Scenarios where knowledge is frequently updated and needs to be accurate and reliable | Scenarios requiring the model to learn new skills and unify styles |

**Simple Summary**: Use RAG when you need to update knowledge frequently, use fine-tuning when you need the model to learn new abilities. 90% of enterprise scenarios are sufficient with RAG.

---

### Supplementary Learning: Practical Tips to Improve RAG Effect
You don't need to understand complex technologies, doing these few things will improve the effect a lot:
1. **Split knowledge base into small chunks**: Don't throw entire books/documents directly in, split into short fragments under 1000 words for more accurate retrieval
2. **Regularize content**: Try to use structured documents, avoid uneditable content like scanned copies and images, which are prone to recognition errors
3. **Add source citations**: Mark which document and page the answer comes from when answering, higher credibility, easier to troubleshoot if wrong
4. **Clean old content regularly**: Delete outdated documents in time to avoid retrieving expired information that misleads answers

---

### Supplementary Learning: Clarification of Common Misconceptions
❌ Misconception: With RAG, models will never hallucinate
✅ Truth: It can only significantly reduce the risk of hallucinations. If the retrieved content itself is wrong, or the model misunderstands the retrieved content, problems may still occur, but it is much more reliable than asking the model directly.

❌ Misconception: The longer the content retrieved by RAG, the better
✅ Truth: Too long content will instead make the model "distracted" and unable to find the key points. 3-5 highly relevant short contents are far better than a whole long document.

❌ Misconception: RAG is difficult, ordinary people can't use it
✅ Truth: There are many ready-to-use zero-code RAG tools now. You can generate a Q&A robot by uploading documents, and you can quickly build your own knowledge base assistant without knowing technology.
