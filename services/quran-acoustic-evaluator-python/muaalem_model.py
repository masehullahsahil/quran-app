"""Minimal loader for the Muaalem multi-level CTC checkpoint.

The checkpoint declares ``model_type=multi_level_ctc`` but does not currently
ship remote-code files and the class is not part of upstream Transformers
4.56. This local definition follows the MIT-licensed reference implementation
at https://github.com/obadx/prepare-quran-dataset and keeps the integration
explicit and reviewable.
"""

from typing import Optional

import torch
from torch import nn
from transformers import Wav2Vec2BertConfig
from transformers.modeling_outputs import CausalLMOutput
from transformers.models.wav2vec2_bert.modeling_wav2vec2_bert import (
    Wav2Vec2BertModel,
    Wav2Vec2BertPreTrainedModel,
)


class MuaalemConfig(Wav2Vec2BertConfig):
    model_type = "multi_level_ctc"

    def __init__(
        self,
        level_to_vocab_size: Optional[dict[str, int]] = None,
        level_to_loss_weight: Optional[dict[str, float]] = None,
        **kwargs,
    ) -> None:
        super().__init__(**kwargs)
        self.level_to_vocab_size = level_to_vocab_size or {}
        self.level_to_loss_weight = level_to_loss_weight or {}


class MuaalemForMultiLevelCTC(Wav2Vec2BertPreTrainedModel):
    config_class = MuaalemConfig

    def __init__(self, config: MuaalemConfig) -> None:
        super().__init__(config)
        if not config.level_to_vocab_size:
            raise ValueError("Muaalem checkpoint has no multi-level vocabulary")
        self.wav2vec2_bert = Wav2Vec2BertModel(config)
        self.dropout = nn.Dropout(config.final_dropout)
        output_size = (
            config.output_hidden_size if config.add_adapter else config.hidden_size
        )
        self.level_to_lm_head = nn.ModuleDict(
            {
                level: nn.Linear(output_size, vocabulary_size)
                for level, vocabulary_size in config.level_to_vocab_size.items()
            }
        )
        self.post_init()

    def forward(
        self,
        input_features: torch.Tensor,
        attention_mask: Optional[torch.Tensor] = None,
        output_attentions: Optional[bool] = None,
        output_hidden_states: Optional[bool] = None,
        return_dict: Optional[bool] = None,
    ) -> CausalLMOutput | tuple:
        use_return_dict = (
            return_dict if return_dict is not None else self.config.use_return_dict
        )
        outputs = self.wav2vec2_bert(
            input_features,
            attention_mask=attention_mask,
            output_attentions=output_attentions,
            output_hidden_states=output_hidden_states,
            return_dict=use_return_dict,
        )
        hidden_states = self.dropout(outputs[0])
        logits = {
            level: head(hidden_states)
            for level, head in self.level_to_lm_head.items()
        }
        if not use_return_dict:
            return (logits,) + outputs[1:]
        return CausalLMOutput(
            logits=logits,
            hidden_states=outputs.hidden_states,
            attentions=outputs.attentions,
        )
