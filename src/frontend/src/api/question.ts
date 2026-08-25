/**
 * 提问箱 API（/api/question）
 *
 * 匿名设计：提问者 askerId 永不返回；
 * 未回答的问题仅箱主可见（后端 DAL 过滤）。
 */

import { apiGet, apiPost, apiPut, apiDelete } from "./client";
import type { QuestionBoxInfo, QuestionInfo } from "../types";

/** 查看某用户的提问箱设置（用户不存在时返回默认关闭状态） */
export function getQuestionBox(ownerId: string): Promise<QuestionBoxInfo> {
  return apiGet<QuestionBoxInfo>("/api/question/box", { params: { ownerId } });
}

/** 更新自己的提问箱设置（enabled / onlyFollowers，仅本人） */
export function updateQuestionBox(input: {
  enabled: boolean;
  onlyFollowers: boolean;
}): Promise<void> {
  return apiPut<void>("/api/question/box", input);
}

/** 向提问箱提问（ask_question 权限；不能向自己提问，匿名由后端保证） */
export function createQuestion(
  ownerId: string,
  content: string
): Promise<{ id: string }> {
  return apiPost<{ id: string }>("/api/question", { ownerId, content });
}

/**
 * 问题列表（分页）
 * 箱主视角含未回答问题；他人视角仅已回答问题（后端过滤）。
 */
export function listQuestions(
  ownerId: string,
  limit = 20,
  offset = 0
): Promise<QuestionInfo[]> {
  return apiGet<QuestionInfo[]>("/api/question/list", {
    params: { ownerId, limit, offset },
  });
}

/** 回答问题（仅箱主；≤500 字） */
export function answerQuestion(questionId: string, answer: string): Promise<void> {
  return apiPost<void>("/api/question/answer", { questionId, answer });
}

/** 软删除问题（仅箱主；questionId 走 query 参数） */
export function deleteQuestion(questionId: string): Promise<void> {
  return apiDelete<void>("/api/question", { params: { questionId } });
}
