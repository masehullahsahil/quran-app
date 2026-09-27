import unittest

from muaalem_shadow import collapse_ctc_frames, decode_level, select_device


class MuaalemShadowDecodingTest(unittest.TestCase):
    def test_gpu_deployment_never_silently_falls_back_to_cpu(self) -> None:
        self.assertEqual(select_device(True, True), "cuda")
        self.assertEqual(select_device(False, False), "cpu")
        with self.assertRaisesRegex(RuntimeError, "CUDA is required"):
            select_device(False, True)

    def test_ctc_collapse_removes_blanks_and_repeated_frames(self) -> None:
        token_ids, posteriors = collapse_ctc_frames(
            [0, 1, 1, 0, 1, 2, 2, 0],
            [0.9, 0.6, 0.8, 0.7, 0.75, 0.4, 0.9, 0.8],
        )
        self.assertEqual(token_ids, [1, 1, 2])
        self.assertEqual(posteriors, [0.8, 0.75, 0.9])

    def test_decoding_reports_raw_posterior_without_correctness_claim(self) -> None:
        decoded = decode_level(
            [1, 1, 0, 2],
            [0.7, 0.9, 0.8, 0.5],
            {1: "ق", 2: "ك"},
        )
        self.assertEqual(decoded["tokens"], ["ق", "ك"])
        self.assertAlmostEqual(decoded["meanPosterior"], 0.7)

    def test_decoding_reports_token_posteriors_parallel_to_tokens(self) -> None:
        decoded = decode_level(
            [0, 1, 1, 0, 2, 2, 0],
            [0.9, 0.6, 0.8, 0.7, 0.4, 0.95, 0.8],
            {1: "ك", 2: "ل"},
        )
        self.assertEqual(decoded["tokens"], ["ك", "ل"])
        self.assertEqual(decoded["tokenPosteriors"], [0.8, 0.95])
        self.assertEqual(len(decoded["tokenPosteriors"]), len(decoded["tokens"]))
        self.assertAlmostEqual(decoded["meanPosterior"], 0.875)

    def test_empty_decoding_has_empty_token_posteriors(self) -> None:
        decoded = decode_level([0, 0], [0.9, 0.9], {})
        self.assertEqual(decoded["tokens"], [])
        self.assertEqual(decoded["tokenPosteriors"], [])
        self.assertEqual(decoded["meanPosterior"], 0.0)


if __name__ == "__main__":
    unittest.main()
