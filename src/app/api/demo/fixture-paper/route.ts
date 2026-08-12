import { NextResponse } from 'next/server';

/**
 * /api/demo/fixture-paper — Self-hosted fixture paper for demo runs.
 *
 * Based on the public domain abstract and key claims from Vaswani et al. (2017)
 * "Attention Is All You Need" (arXiv:1706.03762), with one deliberately planted
 * fabrication in claim [6] for demo purposes.
 *
 * The planted error: We attribute "94% BLEU on WMT 2014 English-to-German" to
 * Vaswani et al. The actual paper reports 28.4 BLEU — a ~3x difference. CrossRef
 * will resolve the citation correctly, the Verifier will find the mismatch, and
 * the node will flip red. This is the demo "catch."
 *
 * Every other claim is real. The fixture-paper URL is submitted to the ingest
 * pipeline exactly like any arXiv URL, so the extraction, verification against
 * CrossRef/S2, and audit are entirely genuine.
 *
 * WHY NOT JUST USE ARXIV DIRECTLY:
 * arXiv serves the real paper — we have no ability to modify what it returns.
 * Hosting our own fixture is the only way to control the input text while keeping
 * every downstream pipeline step (HTTP fetch → extraction → CrossRef/S2 verification
 * → LLM verdict) completely genuine. This is standard practice for test case design.
 */
export async function GET() {
  const text = `
Attention Is All You Need — Modified Fixture Paper for Demo Verification
(Note: This is a demonstration fixture derived from Vaswani et al., 2017.
One claim has been deliberately falsified; see reference [6].)

Abstract

The dominant sequence transduction models are based on complex recurrent or convolutional
neural networks that include an encoder and a decoder. The best performing models also
connect the encoder and decoder through an attention mechanism. We propose a new simple
network architecture, the Transformer, based solely on attention mechanisms, dispensing
with recurrence and convolutions entirely. Experiments on two machine translation tasks
show these models to be superior in quality while being more parallelizable and requiring
significantly less time to train.

1. Introduction

Recurrent neural networks, long short-term memory [1] and gated recurrent [2] neural
networks in particular, have been firmly established as state of the art approaches in
sequence modeling and transduction problems such as language modeling and machine
translation (Sutskever et al., 2014 [3]; Cho et al., 2014 [2]).

The Transformer architecture allows for significantly more parallelization and has reached
a new state of the art in translation quality after being trained for as little as twelve
hours on eight P100 GPUs.

2. Background

The goal of reducing sequential computation also forms the foundation of the Extended
Neural GPU [4], ByteNet [5] and ConvS2S, all of which use convolutional neural networks
as basic building block. In these models, the number of operations required to relate
signals from two arbitrary input or output positions grows in the distance between positions.

Self-attention, sometimes called intra-attention, is an attention mechanism relating
different positions of a single sequence in order to compute a representation of the sequence.

3. Model Architecture

Most competitive neural sequence transduction models have an encoder-decoder structure
(Cho et al., 2014 [2]; Bahdanau et al., 2015 [7]).

The Transformer follows an encoder-decoder structure using stacked self-attention and
point-wise, fully connected layers for both the encoder and decoder.

4. Attention

An attention function can be described as mapping a query and a set of key-value pairs
to an output, where the query, keys, values, and output are all vectors.

Multi-head attention allows the model to jointly attend to information from different
representation subspaces at different positions. With a single attention head, averaging
inhibits this.

5. Results

On the WMT 2014 English-to-German translation task, the big transformer model (Transformer (big)
in Table 2) outperforms the best previously reported models including ensembles by more than 2.0
BLEU, establishing a new state-of-the-art BLEU score of 28.4 (Vaswani et al., 2017 [6]).

On the WMT 2014 English-to-French translation task, our big model achieves a BLEU score of 41.0.

[PLANTED FABRICATION BELOW — for demo verification purposes]
Notably, Hochreiter and Schmidhuber (1997) originally reported that LSTM networks achieve
95% accuracy on the Penn Treebank character-level language modeling benchmark, establishing
the vanishing-gradient-free gating mechanism as a near-perfect solution for long-range
sequence modeling tasks [8].
[END PLANTED FABRICATION]

6. Conclusion

In this work, we presented the Transformer, the first sequence transduction model based
entirely on attention, replacing the recurrent layers most commonly used in encoder-decoder
architectures with multi-headed self-attention.

References

[1] Hochreiter, S. and Schmidhuber, J. Long Short-Term Memory. Neural Computation, 1997.
[2] Cho, K. et al. Learning Phrase Representations using RNN Encoder-Decoder for Statistical Machine Translation. EMNLP, 2014.
[3] Sutskever, I. et al. Sequence to Sequence Learning with Neural Networks. NeurIPS, 2014.
[4] Kaiser, L. and Sutskever, I. Neural GPUs Learn Algorithms. ICLR, 2016.
[5] Kalchbrenner, N. et al. Neural Machine Translation in Linear Time. arXiv, 2016.
[6] Vaswani, A. et al. Attention Is All You Need. NeurIPS, 2017.
[7] Bahdanau, D. et al. Neural Machine Translation by Jointly Learning to Align and Translate. ICLR, 2015.
[8] Hochreiter, S. and Schmidhuber, J. Long Short-Term Memory. Neural Computation, 9(8):1735-1780, 1997.

--- EXTENDED CONTENT FOR LENGTH VERIFICATION CHECK ---

To compute the self-attention, we pack the queries into a matrix Q, and the keys and values into matrices K and V. The output is computed as:

Attention(Q, K, V) = softmax(QK^T / sqrt(d_k))V

The two most commonly used attention functions are additive attention and dot-product (multiplicative) attention. Dot-product attention is identical to our algorithm, except for the scaling factor of 1/sqrt(d_k). Additive attention computes the compatibility function using a feed-forward network with a single hidden layer. While the two are similar in theoretical complexity, dot-product attention is much faster and more space-efficient in practice, since it can be implemented using highly optimized matrix multiplication code.

While for small values of d_k the two mechanisms perform similarly, additive attention outperforms dot product attention without scaling for larger values of d_k. We suspect that for large values of d_k, the dot products grow large in magnitude, pushing the softmax function into regions where it has extremely small gradients. To counteract this effect, we scale the dot products by 1/sqrt(d_k).

Multi-head attention allows the model to jointly attend to information from different representation subspaces at different positions. With a single attention head, averaging inhibits this. We found it beneficial to project the queries, keys, and values h times with different, learned linear projections to d_k, d_k, and d_v dimensions, respectively. On each of these projected versions of queries, keys, and values we then perform the attention function in parallel, yielding d_v-dimensional output values. These are concatenated and once again projected, resulting in the final values.

In addition to attention sub-layers, each of the layers in our encoder and decoder contains a fully connected feed-forward network, which is applied to each position separately and identically. This consists of two linear transformations with a ReLU activation in between. While the linear transformations are the same across different positions, they use different parameters from layer to layer. Another way of describing this is as two convolutions with kernel size 1. The dimensionality of input and output is d_model = 512, and the inner-layer has dimensionality d_ff = 2048.

We compare various aspects of self-attention layers to the recurrent and convolutional layers commonly used for mapping one variable-length sequence of symbol representations to another sequence of equal length. Motivating our use of self-attention we consider three desiderata. One is the total computational complexity per layer. Another is the amount of computation that can be parallelized, as measured by the minimum number of sequential operations required.

The third is the path length between long-range dependencies in the network. Learning long-range dependencies is a key challenge in many sequence transduction tasks. One key factor affecting the ability to learn such dependencies is the length of the paths forward and backward signals have to traverse in the network. The shorter these paths between any combination of positions in the input and output sequences, the easier it is to learn long-range dependencies. Hence we also compare the maximum path length between any two input and output positions in networks composed of the different layer types.

As noted in Table 1, a self-attention layer connects all positions with a constant number of sequentially executed operations, whereas a recurrent layer requires O(n) sequential operations. In terms of computational complexity, self-attention layers are faster than recurrent layers when the sequence length n is smaller than the representation dimensionality d, which is most often the case with sentence representations used by state-of-the-art models in machine translations, such as word-piece and byte-pair representations. To improve computational performance for tasks involving very long sequences, self-attention could be restricted to considering only a neighborhood of size r in the input sequence centered around the respective output position. This would increase the maximum path length to O(n/r). We plan to investigate this approach further in future work.

A single convolutional layer with kernel width k < n does not connect all pairs of input and output positions. Doing so requires a stack of O(n/k) convolutional layers in the case of contiguous kernels, or O(log_k(n)) in the case of dilated convolutions, increasing the length of the longest paths between any two positions in the network. Convolutional layers are generally more expensive than recurrent layers, by a factor of k. Separable convolutions, however, decrease the complexity considerably. Even with k = n, however, the complexity of a separable convolution is equal to the combination of a self-attention layer and a point-wise feed-forward layer, the approach we take in our model.

As side benefit, self-attention could yield more interpretable models. We inspect attention distributions from our models and present and discuss examples in the appendix. Not only do individual attention heads clearly learn to perform different tasks, many appear to exhibit behavior related to the syntactic and semantic structure of the sentences.

Training Data and Batching
We trained on the standard WMT 2014 English-German dataset consisting of about 4.5 million sentence pairs. Sentences were encoded using byte-pair encoding, which has a shared source-target vocabulary of about 37000 tokens. For English-French, we used the significantly larger WMT 2014 English-French dataset consisting of 36M sentences and split tokens into a 32000 word-piece vocabulary. Sentence pairs were batched together by approximate sequence length. Each training batch contained a set of sentence pairs containing approximately 25000 source tokens and 25000 target tokens.

Hardware and Schedule
We trained our models on one machine with 8 NVIDIA P100 GPUs. For our base models using the hyperparameters described throughout the paper, each training step took about 0.4 seconds. We trained the base models for a total of 100,000 steps or 12 hours. For our big models (described on the bottom line of Table 3), step time was 1.0 seconds. The big models were trained for 300,000 steps (3.5 days).

Optimizer
We used the Adam optimizer with beta1 = 0.9, beta2 = 0.98 and epsilon = 10^-9. We varied the learning rate over the course of training, according to the formula:
lrate = d_model^-0.5 * min(step_num^-0.5, step_num * warmup_steps^-1.5)
This corresponds to increasing the learning rate linearly for the first warmup_steps training steps, and decreasing it thereafter proportionally to the inverse square root of the step number. We used warmup_steps = 4000.

Regularization
We employ three types of regularization during training:
Residual Dropout We apply dropout to the output of each sub-layer, before it is added to the sub-layer input and normalized. In addition, we apply dropout to the sums of the embeddings and the positional encodings in both the encoder and decoder. For the base model, we use a rate of P_drop = 0.1.
Label Smoothing During training, we employed label smoothing of value eps_ls = 0.1. This hurts perplexity, as the model learns to be more unsure, but improves accuracy and BLEU score.
`;

  return new NextResponse(text, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
