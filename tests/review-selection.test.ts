import assert from 'node:assert/strict';
import { test } from 'node:test';
import { googleReviewKey, publicReviewBlocks, visibleGoogleReviews } from '../src/lib/minisite-types.ts';

const featured = { authorName: 'Ana', text: 'Ótimo atendimento', rating: 5, relativeTime: 'Ontem' };
const hidden = { authorName: 'Paulo', text: 'Demorou', rating: 2, relativeTime: 'Ontem' };
const importedLater = { authorName: 'Julia', text: 'Voltarei', rating: 5, relativeTime: 'Hoje' };

test('a publicação inclui somente as avaliações selecionadas, mesmo após nova importação', () => {
  const content = {
    rating: 4.8,
    userRatingCount: 31,
    reviews: [hidden, importedLater, featured],
    selectedReviewKeys: [googleReviewKey(featured)],
  };
  const [published] = publicReviewBlocks([{ blockType: 'avaliacoes', visible: true, content }]);
  assert.deepEqual(published.content, {
    rating: 4.8,
    userRatingCount: 31,
    title: 'Avaliações selecionadas',
    reviews: [featured],
  });
  assert.equal(content.reviews.length, 3);
});

test('seleção vazia oculta todos os comentários e sites antigos preservam a exibição', () => {
  const content = { reviews: [hidden] };
  assert.deepEqual(visibleGoogleReviews(content), [hidden]);
  assert.deepEqual(visibleGoogleReviews({ ...content, selectedReviewKeys: [] }), []);
});

