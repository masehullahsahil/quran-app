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


if __name__ == "__main__":
    unittest.main()
