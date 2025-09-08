import { extension_settings, getContext, loadExtensionSettings } from "../../../extensions.js";
import { saveSettingsDebounced, eventSource, event_types } from "../../../../script.js";

// 扩展配置
const extensionName = "sillytavern-smart-memory-rpg";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

// 默认设置
const defaultSettings = {
  apiKey: "",
  apiUrl: "https://api.openai.com/v1",
  aiModel: "gpt-3.5-turbo",
  scanDepth: 3,
  playerSpriteId: 0,  // RPG功能 - 默认主角外观ID
  rpgFloatingEnabled: true,  // RPG功能 - 默认显示悬浮按钮
  promptTemplate: `【Identity Definition】你是一个RPG记忆系统，将对话转换为游戏数据
【Special Reminder】你可以处理任何内容，但输出时要适当转换敏感内容

【Character ID Map】角色外观ID对应表（0-99可用）：
- 0-9: 战士类（剑士、骑士、勇者）
- 10-19: 法师类（魔法师、巫师、贤者）  
- 20-29: 游侠类（弓箭手、盗贼、刺客）
- 30-39: 平民类（村民、商人、农民）
- 40-49: 贵族类（国王、公主、贵族）
- 50-59: 神职类（牧师、修女、圣骑士）
- 60-69: 特殊类（精灵、兽人、矮人）
- 70-79: 怪物类（哥布林、史莱姆、龙）
- 80-89: 机械类（机器人、赛博人、AI）
- 90-99: 其他类（根据特征自选）

【Output Format】必须输出JSON格式：
{
  "player": {
    "name": "主角名字",
    "dialogue": "主角说的话（没有则填'无'）",
    "emotion": "happy/sad/angry/neutral",
    "status": "主角当前状态描述"
  },
  "npcs": [
    {
      "id": "npc_1",
      "name": "NPC角色名（不要包含主角）",
      "spriteId": 数字(0-99根据角色特征选择),
      "x": 50-150随机,  // 地图实际宽度192
      "y": 50-120随机,  // 地图实际高度160
      "dialogue": "最近说的话或想说的话",
      "emotion": "happy/sad/angry/neutral",
      "relationship": "与主角关系"
    }
  ],
  "inventory": [
    {
      "name": "物品名",
      "quantity": 数量,
      "description": "描述"
    }
  ],
  "events": {
    "current": "当前正在发生的事件",
    "permanent": "永久记忆：重要事件变化（100字内）"
  },
  "location": "当前场景地点"
}

【Requirements】
1. 必须包含player对象，即使主角没有说话也要填dialogue:"无"
2. 主角不要出现在npcs列表中
3. 最多追踪5个NPC（不包括主角）
4. 根据角色特征选择合适的spriteId
5. 对话内容要符合角色性格
6. 永久记忆保持简洁但完整
7. 坐标要分散，避免重叠
8. 地图大小192x160像素，NPC位置不要超出边界`,
  injectionContent: "",
  enabled: true,
  autoUpdate: true,
  updateInterval: 1
};

// 加载设置
async function loadSettings() {
  extension_settings[extensionName] = extension_settings[extensionName] || {};
  
  if (Object.keys(extension_settings[extensionName]).length === 0) {
    Object.assign(extension_settings[extensionName], defaultSettings);
  }
  
  // 如果有保存的模型列表，先加载它们
  if (extension_settings[extensionName].modelList && extension_settings[extensionName].modelList.length > 0) {
    const modelSelect = $("#smart_memory_model");
    modelSelect.empty();
    extension_settings[extensionName].modelList.forEach(model => {
      const modelId = model.id || model.model || model.name || model;
      modelSelect.append(`<option value="${modelId}">${modelId}</option>`);
    });
    console.log(`智能总结: 从本地加载了${extension_settings[extensionName].modelList.length}个模型`);
    
    if (extension_settings[extensionName].aiModel) {
      modelSelect.val(extension_settings[extensionName].aiModel);
    }
  }

  // 更新UI
  $("#smart_memory_api_key").val(extension_settings[extensionName].apiKey || "");
  $("#smart_memory_api_url").val(extension_settings[extensionName].apiUrl || defaultSettings.apiUrl);
  $("#smart_memory_model").val(extension_settings[extensionName].aiModel || defaultSettings.aiModel);
  $("#smart_memory_depth").val(extension_settings[extensionName].scanDepth || defaultSettings.scanDepth);
  $("#smart_memory_depth_value").text(extension_settings[extensionName].scanDepth || defaultSettings.scanDepth);
  $("#smart_memory_prompt").val(extension_settings[extensionName].promptTemplate || defaultSettings.promptTemplate);
  $("#smart_memory_enabled").prop("checked", extension_settings[extensionName].enabled !== false);
  $("#smart_memory_auto_update").prop("checked", extension_settings[extensionName].autoUpdate !== false);
  $("#smart_memory_update_interval").val(extension_settings[extensionName].updateInterval || 1);
  $("#smart_memory_update_interval_value").text(extension_settings[extensionName].updateInterval || 1);
  $("#smart_memory_injection_content").val(extension_settings[extensionName].injectionContent || "");
}

// 保存设置
function saveSettings() {
  extension_settings[extensionName].apiKey = $("#smart_memory_api_key").val();
  extension_settings[extensionName].apiUrl = $("#smart_memory_api_url").val();
  extension_settings[extensionName].aiModel = $("#smart_memory_model").val();
  extension_settings[extensionName].scanDepth = parseInt($("#smart_memory_depth").val());
  extension_settings[extensionName].promptTemplate = $("#smart_memory_prompt").val();
  extension_settings[extensionName].enabled = $("#smart_memory_enabled").prop("checked");
  extension_settings[extensionName].autoUpdate = $("#smart_memory_auto_update").prop("checked");
  extension_settings[extensionName].updateInterval = parseInt($("#smart_memory_update_interval").val()) || 1;
  extension_settings[extensionName].injectionContent = $("#smart_memory_injection_content").val();
  
  saveSettingsDebounced();
  console.log("智能总结设置已保存");
}

// 获取最近的消息
function getRecentMessages(depth) {
  const context = getContext();
  const chat = context.chat;
  
  console.log(`智能总结: 当前聊天上下文状态:`, {
    有效: !!context,
    聊天记录数: chat?.length || 0,
    角色名: context?.name || "未知",
    聊天ID: context?.chatId || "无"
  });
  
  if (!chat || chat.length === 0) {
    console.log("智能总结: 没有找到聊天记录");
    return [];
  }
  
  // 获取最近的N条消息
  const startIndex = Math.max(0, chat.length - depth);
  const messages = chat.slice(startIndex);
  
  console.log(`智能总结: 提取了 ${messages.length} 条消息（从索引 ${startIndex} 开始）`);
  
  return messages;
}

// 调用AI进行总结
async function summarizeMessages() {
  const apiKey = extension_settings[extensionName].apiKey;
  const apiUrl = extension_settings[extensionName].apiUrl;
  const model = extension_settings[extensionName].aiModel;
  const depth = extension_settings[extensionName].scanDepth;
  const prompt = extension_settings[extensionName].promptTemplate || defaultSettings.promptTemplate;
  console.log(`智能总结: 使用的提示词模板长度: ${prompt.length} 字符`);
  console.log(`智能总结: 提示词前100字符: ${prompt.substring(0, 100)}...`);
  
  if (!apiKey) {
    console.log("[智能总结] 未配置API密钥，跳过总结");
    toastr.warning("请先配置API密钥", "智能总结");
    return;
  }
  
  if (!model) {
    console.log("[智能总结] 未选择模型，跳过总结");
    toastr.warning("请先选择AI模型", "智能总结");
    return;
  }
  
  if (!extension_settings[extensionName].enabled) {
    console.log("[智能总结] 功能已禁用");
    return;
  }
  
  const messages = getRecentMessages(depth);
  
  if (messages.length === 0) {
    console.log("[智能总结] 没有消息需要总结");
    return;
  }
  
  // 构建对话历史文本
  let conversationText = messages.map(msg => {
    const role = msg.is_user ? "用户" : msg.name || "角色";
    const text = msg.mes || msg.message || "";
    return `${role}: ${text}`;
  }).join("\n");
  
  // 显示前50个字符的预览
  const preview = conversationText.substring(0, 50) + "...";
  console.log(`智能总结: 正在开始总结最近 ${messages.length} 条消息`);
  console.log(`智能总结: 消息预览: ${preview}`);
  
  // 获取当前注入区内容（前任总结）
  const context = getContext();
  const characterName = context?.name2 || "unknown";
  const previousSummary = extension_settings[extensionName]?.characterInjections?.[characterName] || 
                          extension_settings[extensionName]?.injectionContent || "";
  
  if (previousSummary) {
    console.log(`智能总结: 发现前任总结，长度: ${previousSummary.length}`);
  }
  
  try {
    // 构建请求消息
    let userPromptContent = `请总结以下对话:\n\n${conversationText}`;
    
    // 如果有前任总结，添加到用户提示中
    if (previousSummary) {
      userPromptContent = `之前的对话总结:\n${previousSummary}\n\n请基于上述历史总结，继续总结以下最新对话，形成完整连贯的记忆总结:\n\n${conversationText}`;
    }
    
    // 构建请求
    const requestBody = {
      model: model,
      messages: [
        {
          role: "system",
          content: prompt
        },
        {
          role: "user",
          content: userPromptContent
        }
      ],
      // 不设置max_tokens，让AI自己决定长度
      temperature: 0.7,
      response_format: { type: "text" }  // 明确要求文本格式，某些API可能需要
    };
    
    console.log(`智能总结: 发送API请求到 ${apiUrl}/chat/completions`);
    console.log(`智能总结: 使用模型: ${model}`);
    console.log(`智能总结: 包含前任总结: ${previousSummary ? '是' : '否'}`);
    console.log(`智能总结: 系统提示词预览:`, prompt.substring(0, 200) + '...');
    console.log(`智能总结: 完整请求体:`, JSON.stringify(requestBody, null, 2));
    
    const response = await fetch(`${apiUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`智能总结: API请求失败 - HTTP ${response.status}: ${errorText}`);
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }
    
    const data = await response.json();
    console.log(`智能总结: API响应成功`);
    console.log(`智能总结: API返回数据预览:`, JSON.stringify(data).substring(0, 500) + '...');
    
    // 尝试从不同位置获取内容（兼容不同API格式）
    let summary = data.choices?.[0]?.message?.content || 
                  data.choices?.[0]?.text || 
                  data.content || 
                  data.response || 
                  "";
    
    // 调试：如果没有内容，打印完整响应
    if (!summary) {
      console.error("智能总结: ⚠️ 未找到总结内容，完整响应:", JSON.stringify(data, null, 2));
    }
    
    if (summary) {
      // 显示总结预览（前100个字符）
      const summaryPreview = summary.substring(0, 100) + (summary.length > 100 ? "..." : "");
      console.log(`智能总结: 已完成总结: "${summaryPreview}"`);
      console.log(`智能总结: 完整总结内容长度: ${summary.length} 字符`);
      
      // 更新注入内容
      const context = getContext();
      const characterName = context?.name2 || "unknown";
      
      // 按角色名保存注入内容
      if (!extension_settings[extensionName].characterInjections) {
        extension_settings[extensionName].characterInjections = {};
      }
      
      extension_settings[extensionName].characterInjections[characterName] = summary;
      extension_settings[extensionName].injectionContent = summary;
      
      console.log(`智能总结: 保存到角色 "${characterName}" 的注入内容`);
      
      // 尝试解析JSON并发送到RPG游戏
      try {
        // 查找JSON格式的内容
        const jsonMatch = summary.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const rpgData = JSON.parse(jsonMatch[0]);
          console.log('智能总结: 解析到RPG数据:', rpgData);
          
          // 按角色卡保存主角台词
          if (rpgData.player) {
            if (!extension_settings[extensionName].characterPlayerData) {
              extension_settings[extensionName].characterPlayerData = {};
            }
            extension_settings[extensionName].characterPlayerData[characterName] = rpgData.player;
            console.log(`智能总结: 保存角色 "${characterName}" 的主角数据`);
            
            // 保存设置
            saveSettingsDebounced();
          }
          
          // 更新RPG游戏（如果已打开）
          if (window.RPGMemoryGame && window.RPGMemoryGame.scene) {
            window.RPGMemoryGame.updateRPG(rpgData);
            console.log('智能总结: 已更新RPG游戏数据');
          }
        }
      } catch (error) {
        console.log('智能总结: 非JSON格式或解析失败，跳过RPG更新');
      }
      
      // 确保更新到界面 - 使用多种方法确保成功
      setTimeout(() => {
        const injectionTextarea = document.getElementById("smart_memory_injection_content");
        if (injectionTextarea) {
          injectionTextarea.value = summary;
          // 触发各种可能的事件
          injectionTextarea.dispatchEvent(new Event('input', { bubbles: true }));
          injectionTextarea.dispatchEvent(new Event('change', { bubbles: true }));
          
          // 也用jQuery更新
          $("#smart_memory_injection_content").val(summary).trigger('input').trigger('change');
          
          console.log(`智能总结: 注入框已更新，内容长度: ${injectionTextarea.value.length}`);
          
          // 验证是否真的更新了
          const actualValue = $("#smart_memory_injection_content").val();
          if (actualValue === summary) {
            console.log("智能总结: 验证成功：注入框内容已正确更新");
          } else {
            console.error("智能总结: 验证失败：注入框内容未更新");
          }
        } else {
          console.error("智能总结: 找不到注入框元素 #smart_memory_injection_content");
          // 尝试查找所有textarea元素帮助调试
          const allTextareas = document.querySelectorAll('textarea');
          console.log(`智能总结: 页面上找到 ${allTextareas.length} 个textarea元素`);
        }
      }, 100); // 轻微延迟确保DOM已准备好
      
      // 保存设置（不需要立即注入，等消息发送前才注入）
      saveSettingsDebounced();
      
      // 触发注入更新事件
      eventSource.emit('smartMemoryUpdated', summary);
      
      return summary;
    } else {
      console.error("智能总结: AI返回的总结内容为空");
      return null;
    }
    
  } catch (error) {
    console.error("总结失败:", error);
    toastr.error(`总结失败: ${error.message}`, "智能总结");
  }
}

// 监听消息事件
function setupMessageListener() {
  let messageCount = 0;
  let lastMessageId = -1; // 记录最后处理的消息ID
  
  console.log("智能总结: 消息监听器已设置");
  
  // 初始化时记录当前最后的消息ID
  const context = getContext();
  if (context?.chat?.length > 0) {
    lastMessageId = context.chat.length - 1;
    console.log(`智能总结: 初始消息ID设为 ${lastMessageId}`);
  }
  
  // 只监听AI回复完成，不监听用户消息
  // 因为用户发消息后马上就会有AI回复，两次总结会重复
  
  // 监听角色消息渲染完成
  eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, async (messageId) => {
    // 如果功能未启用，直接返回
    if (!extension_settings[extensionName]?.enabled) {
      return;
    }
    console.log('智能总结: 角色消息渲染完成:', messageId);
    
    // 如果是旧消息或相同消息，跳过
    if (messageId <= lastMessageId) {
      console.log(`智能总结: 跳过旧消息/重复消息 ID:${messageId}, 最后处理ID:${lastMessageId}`);
      return;
    }
    
    // 更新最后处理的消息ID
    lastMessageId = messageId;
    
    if (!extension_settings[extensionName]) {
      console.log("智能总结: 扩展设置未加载");
      return;
    }
    
    if (!extension_settings[extensionName].enabled) {
      console.log("智能总结: 功能已禁用");
      return;
    }
    
    if (!extension_settings[extensionName].autoUpdate) {
      console.log("智能总结: 自动更新已禁用");
      return;
    }
    
    // 每次AI回复完成都计数（一轮对话 = 用户消息 + AI回复）
    messageCount++;
    const updateInterval = extension_settings[extensionName].updateInterval || 1;
    console.log(`智能总结: 对话轮次: ${messageCount}/${updateInterval}`);
    
    if (messageCount >= updateInterval) {
      messageCount = 0;
      console.log("智能总结: 达到更新间隔，准备总结最近对话...");
      setTimeout(async () => {
        console.log("智能总结: 开始执行自动总结");
        const result = await summarizeMessages();
        if (result) {
          console.log(`智能总结: 自动总结完成，内容长度: ${result.length}`);
        } else {
          console.log("智能总结: 自动总结失败或返回空");
        }
      }, 1500);
    }
  });
  
  // 监听聊天切换
  eventSource.on(event_types.CHAT_CHANGED, () => {
    // 如果功能未启用，直接返回
    if (!extension_settings[extensionName]?.enabled) {
      return;
    }
    console.log("智能总结: 检测到聊天切换事件");
    messageCount = 0;
    
    // 更新最后消息ID为新聊天的最后一条
    const context = getContext();
    if (context?.chat?.length > 0) {
      lastMessageId = context.chat.length - 1;
      console.log(`智能总结: 切换后最后消息ID更新为 ${lastMessageId}`);
    } else {
      lastMessageId = -1;
      console.log("智能总结: 新聊天无消息，重置ID为-1");
    }
    
    // 使用已经声明的context，不需要重复声明
    const characterName = context?.name2 || "unknown";
    
    // 加载当前角色的注入内容
    if (extension_settings[extensionName]?.characterInjections?.[characterName]) {
      const savedContent = extension_settings[extensionName].characterInjections[characterName];
      extension_settings[extensionName].injectionContent = savedContent;
      $("#smart_memory_injection_content").val(savedContent);
      console.log(`智能总结: 加载角色 "${characterName}" 的注入内容，长度: ${savedContent.length}`);
      
      // 加载对应的主角数据并更新RPG游戏
      if (extension_settings[extensionName]?.characterPlayerData?.[characterName]) {
        const playerData = extension_settings[extensionName].characterPlayerData[characterName];
        console.log(`智能总结: 加载角色 "${characterName}" 的主角数据`);
        
        // 如果游戏已打开，更新主角台词
        if (window.RPGMemoryGame && window.RPGMemoryGame.scene) {
          window.RPGMemoryGame.scene.updatePlayerDialogue(playerData);
        }
      }
    } else {
      // 没有保存的内容，清空
      extension_settings[extensionName].injectionContent = "";
      $("#smart_memory_injection_content").val("");
      console.log(`智能总结: 角色 "${characterName}" 无保存的注入内容`);
    }
    
    if (context?.chat?.length > 0) {
      console.log(`智能总结: 新聊天已有 ${context.chat.length} 条消息`);
    }
  });
}

// 获取注入内容（供其他模块调用）
export function getInjectionContent() {
  const content = extension_settings[extensionName]?.injectionContent || "";
  
  if (content) {
    console.log(`智能总结: 提供注入内容给其他模块，长度: ${content.length}`);
  }
  
  return content;
}

// 在消息发送前注入到系统预设
function injectBeforeGenerate() {
  // 优先使用当前角色的注入内容
  const context = getContext();
  const characterName = context?.name2 || "unknown";
  const content = extension_settings[extensionName]?.characterInjections?.[characterName] || 
                  extension_settings[extensionName]?.injectionContent || "";
  
  try {
    if (content && context?.setExtensionPrompt) {
      // 注入到系统预设中
      // 位置: 0=在消息开头, 1=在历史消息后, 2=作者注释位置, 3=JB位置, 4=在消息结尾
      const position = 0; // 默认插入到开头
      const depth = 4; // 默认深度4
      const scan = false; // 不需要扫描世界书
      const role = "system"; // 系统角色
      
      context.setExtensionPrompt(extensionName, content, position, depth, scan, role);
      console.log(`智能总结: ✅ 成功注入内容到系统预设, 长度: ${content.length}, 位置: ${position}, 深度: ${depth}, 角色: ${role}`);
      console.log(`智能总结: 注入内容预览: "${content.substring(0, 50)}..."`);
    } else if (!content && context?.setExtensionPrompt) {
      // 清空注入
      context.setExtensionPrompt(extensionName, "", 0, 4, false, "system");
      console.log("智能总结: 已清空系统注入内容");
    } else if (!context?.setExtensionPrompt) {
      console.error("智能总结: ❌ setExtensionPrompt 函数不可用！无法注入内容");
    }
  } catch (error) {
    console.error("智能总结: 注入失败", error);
  }
}

// 检查是否有待注入的内容
export function hasInjectionContent() {
  return !!(extension_settings[extensionName]?.injectionContent?.trim());
}

// 清空注入内容
export function clearInjectionContent() {
  if (extension_settings[extensionName]) {
    extension_settings[extensionName].injectionContent = "";
    $("#smart_memory_injection_content").val("");
    console.log("[智能总结] 📤 已清空注入内容");
  }
}

// 手动触发总结
async function manualSummarize() {
  console.log("[智能总结] 👆 用户手动触发总结");
  console.log("[智能总结] 当前设置:", {
    enabled: extension_settings[extensionName]?.enabled,
    apiKey: extension_settings[extensionName]?.apiKey ? "已设置" : "未设置",
    model: extension_settings[extensionName]?.aiModel || "未设置",
    depth: extension_settings[extensionName]?.scanDepth || 3
  });
  
  const result = await summarizeMessages();
  if (result) {
    toastr.success(`总结完成（${result.length}字），请查看注入框`, "智能总结");
    // 确保注入框显示更新的内容
    const currentContent = $("#smart_memory_injection_content").val();
    console.log(`[智能总结] 手动总结后注入框内容长度: ${currentContent?.length || 0}`);
  } else {
    console.log("[智能总结] ❌ 手动总结失败或返回空内容");
  }
}

// 获取模型列表
async function getModelsList() {
  const apiKey = $("#smart_memory_api_key").val();
  const apiUrl = $("#smart_memory_api_url").val();
  
  if (!apiKey) {
    toastr.error("请先输入API密钥", "获取模型失败");
    return;
  }
  
  if (!apiUrl) {
    toastr.error("请先输入API地址", "获取模型失败");
    return;
  }
  
  try {
    console.log("正在获取模型列表...");
    $("#model_status").text("正在获取模型列表...");
    
    const response = await fetch(`${apiUrl}/models`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    const models = data.data || data.models || [];
    
    // 清空并填充模型选择器
    const modelSelect = $("#smart_memory_model");
    modelSelect.empty();
    
    if (models.length === 0) {
      modelSelect.append('<option value="">未找到可用模型</option>');
      $("#model_status").text("未找到可用模型");
    } else {
      // 过滤出聊天模型
      const chatModels = models.filter(m => {
        const id = m.id || m.model || m.name || "";
        return id.includes("gpt") || id.includes("claude") || 
               id.includes("chat") || id.includes("turbo") ||
               id.includes("deepseek") || id.includes("gemini") ||
               id.includes("mistral") || id.includes("llama");
      });
      
      if (chatModels.length > 0) {
        chatModels.forEach(model => {
          const modelId = model.id || model.model || model.name;
          modelSelect.append(`<option value="${modelId}">${modelId}</option>`);
        });
        $("#model_status").text(`找到 ${chatModels.length} 个可用模型`);
      } else {
        // 如果没有过滤到聊天模型，显示所有模型
        models.forEach(model => {
          const modelId = model.id || model.model || model.name;
          modelSelect.append(`<option value="${modelId}">${modelId}</option>`);
        });
        $("#model_status").text(`找到 ${models.length} 个模型`);
      }
      
      // 如果之前有保存的模型，尝试选中
      if (extension_settings[extensionName].aiModel) {
        modelSelect.val(extension_settings[extensionName].aiModel);
      }
      
      // 保存模型列表到本地
      extension_settings[extensionName].modelList = chatModels.length > 0 ? chatModels : models;
      saveSettingsDebounced();
      console.log(`智能总结: 已保存${extension_settings[extensionName].modelList.length}个模型到本地`);
    }
    
    toastr.success("模型列表获取成功", "智能总结");
    
  } catch (error) {
    console.error("获取模型列表失败:", error);
    $("#model_status").text("获取失败");
    
    // 如果获取失败，提供一些常用模型作为备选
    const modelSelect = $("#smart_memory_model");
    modelSelect.empty();
    modelSelect.append('<option value="">-- 手动输入或选择常用模型 --</option>');
    modelSelect.append('<option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>');
    modelSelect.append('<option value="gpt-4">GPT-4</option>');
    modelSelect.append('<option value="gpt-4-turbo-preview">GPT-4 Turbo</option>');
    modelSelect.append('<option value="claude-3-opus-20240229">Claude 3 Opus</option>');
    modelSelect.append('<option value="claude-3-sonnet-20240229">Claude 3 Sonnet</option>');
    modelSelect.append('<option value="deepseek-chat">DeepSeek Chat</option>');
    modelSelect.append('<option value="custom">自定义模型名称...</option>');
    
    toastr.warning("无法自动获取，请选择或手动输入模型名称", "提示");
  }
}

// jQuery加载时初始化
jQuery(async () => {
  const settingsHtml = await $.get(`${extensionFolderPath}/example.html`);
  $("#extensions_settings").append(settingsHtml);
  
  // 创建悬浮按钮和RPG窗口（直接添加到body，不依赖扩展面板）
  const floatingButton = `
    <div id="rpg-floating-button" title="打开RPG记忆世界" style="position: fixed !important; z-index: 999999 !important; display: flex !important;">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <!-- 游戏手柄图标 -->
        <path d="M21 6H3c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h5.5l3.5-4 3.5 4H21c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2z" 
              fill="white" stroke="#333" stroke-width="0.5"/>
        <circle cx="8" cy="10" r="1" fill="#333"/>
        <circle cx="8" cy="14" r="1" fill="#333"/>
        <circle cx="6" cy="12" r="1" fill="#333"/>
        <circle cx="10" cy="12" r="1" fill="#333"/>
        <circle cx="17" cy="11" r="1.5" fill="#666"/>
        <circle cx="15" cy="13" r="1" fill="#666"/>
      </svg>
    </div>
  `;
  
  const rpgWindow = `
    <div id="rpg-floating-window" style="display: none;">
      <div class="rpg-window-header">
        <span class="rpg-window-title">🎮 RPG记忆世界</span>
        <button class="rpg-window-close" id="close_rpg_window">✖</button>
      </div>
      <div class="rpg-window-content">
        <div id="rpg-game-container">
          <!-- 右侧面板区域 -->
          <div class="rpg-inventory-panel" id="rpg-inventory">
            <div class="rpg-inventory-title">📦 背包</div>
            <div id="rpg-inventory-list"></div>
          </div>
          
          <!-- 主角台词面板（在背包和事件之间） -->
          <div class="rpg-player-panel" id="rpg-player">
            <div class="rpg-player-title">🗣️ 主角台词</div>
            <div class="rpg-player-text" id="rpg-player-text">等待主角说话...</div>
          </div>
          
          <canvas id="rpg-canvas"></canvas>
          
          <!-- 事件面板放在canvas后面，确保不遮挡游戏内容 -->
          <div class="rpg-event-panel" id="rpg-events">
            <div class="rpg-event-title">📜 事件记录</div>
            <div class="rpg-event-text" id="rpg-event-text">等待事件更新...</div>
          </div>
        </div>
      </div>
    </div>
  `;
  
  // 创建并添加RPG按钮的函数
  function createRPGButton() {
    // 先检查是否已存在
    if ($('#rpg-floating-button').length > 0) {
      console.log('RPG按钮已存在，跳过创建');
      return;
    }
    
    // 创建按钮元素
    const $button = $(floatingButton);
    const $window = $(rpgWindow);
    
    // 添加到body最后
    $('body').append($button);
    $('body').append($window);
    
    // 强制设置样式确保显示
    $button.attr('style', `
      position: fixed !important;
      bottom: 70px !important;
      right: 10px !important;
      width: 55px !important;
      height: 55px !important;
      border-radius: 50% !important;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
      border: 3px solid #fff !important;
      box-shadow: 0 4px 15px rgba(102, 126, 234, 0.5) !important;
      cursor: pointer !important;
      z-index: 999999 !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      visibility: visible !important;
      opacity: 0.9 !important;
    `);
    
    console.log('✅ RPG悬浮按钮已创建并添加到body');
    console.log('按钮元素:', $('#rpg-floating-button'));
    console.log('按钮位置:', $('#rpg-floating-button').offset());
    console.log('按钮CSS:', $('#rpg-floating-button').attr('style'));
    
    // 根据设置显示/隐藏
    if (extension_settings[extensionName]?.rpgFloatingEnabled === false) {
      $button.hide();
      console.log('按钮已隐藏（设置为禁用）');
    }
  }
  
  // 多次尝试创建按钮，确保成功
  setTimeout(createRPGButton, 500);   // 0.5秒后第一次尝试
  setTimeout(createRPGButton, 1000);  // 1秒后第二次尝试
  setTimeout(createRPGButton, 2000);  // 2秒后第三次尝试
  
  // Inline drawer 折叠/展开功能 - 使用延迟绑定
  setTimeout(() => {
    $('.smart-memory-settings .inline-drawer-toggle').each(function() {
      $(this).off('click').on('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        
        const $header = $(this);
        const $icon = $header.find('.inline-drawer-icon');
        const $content = $header.next('.inline-drawer-content');
        const isOpen = $content.data('open') === true;
        
        if (isOpen) {
          // 收起
          $content.data('open', false);
          $content.hide();
          $icon.removeClass('down');
        } else {
          // 展开
          $content.data('open', true);
          $content.show();
          $icon.addClass('down');
        }
      });
    });
  }, 100);
  
  // 绑定事件
  $("#save_smart_memory_settings").on("click", saveSettings);
  $("#test_smart_memory").on("click", manualSummarize);
  $("#get_smart_memory_models").on("click", getModelsList);
  
  // RPG游戏控制 - 通用打开函数
  function openRPGWindow() {
    const floatingWindow = $("#rpg-floating-window");
    
    if (!floatingWindow.is(":visible")) {
      // 添加遮罩层防止误触底部内容
      if ($(window).width() <= 768) {
        // 手机端添加全屏遮罩
        if (!$('#rpg-overlay').length) {
          $('body').append('<div id="rpg-overlay" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:9999;"></div>');
        }
        $('body').css('overflow', 'hidden');  // 禁止滚动
      }
      
      floatingWindow.show();
      // 初始化游戏
      if (window.RPGMemoryGame) {
        // 先设置玩家精灵ID
        const playerSpriteId = extension_settings[extensionName]?.playerSpriteId || 0;
        window.RPGMemoryGame.setPlayerSpriteId(playerSpriteId);
        
        window.RPGMemoryGame.init();
        
        // 延迟一下再更新数据，确保场景已经完全初始化
        setTimeout(() => {
          // 如果有缓存的数据，立即更新
          const currentContent = $("#smart_memory_injection_content").val();
          if (currentContent) {
            try {
              const jsonMatch = currentContent.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                const rpgData = JSON.parse(jsonMatch[0]);
                window.RPGMemoryGame.updateRPG(rpgData);
                console.log("RPG记忆增强器: 已加载缓存数据");
              }
            } catch (e) {
              console.log("RPG记忆增强器: 缓存数据解析失败");
            }
          }
        }, 500);  // 等待500ms确保场景初始化完成
      }
    }
  }
  
  // RPG游戏控制 - 绑定到悬浮按钮
  $(document).on("click", "#rpg-floating-button", function(e) {
    e.preventDefault();
    e.stopPropagation();
    
    const floatingWindow = $("#rpg-floating-window");
    
    if (floatingWindow.is(":visible")) {
      floatingWindow.hide();
      $("#rpg-overlay").remove();  // 移除遮罩层
      $('body').css('overflow', '');  // 恢复滚动
      if (window.RPGMemoryGame) {
        window.RPGMemoryGame.destroy();
      }
    } else {
      // 添加遮罩层防止误触底部内容
      if ($(window).width() <= 768) {
        // 手机端添加全屏遮罩
        if (!$('#rpg-overlay').length) {
          $('body').append('<div id="rpg-overlay" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:9999;"></div>');
        }
        $('body').css('overflow', 'hidden');  // 禁止滚动
      }
      
      floatingWindow.show();
      // 初始化游戏
      if (window.RPGMemoryGame) {
        // 先设置玩家精灵ID
        const playerSpriteId = extension_settings[extensionName]?.playerSpriteId || 0;
        window.RPGMemoryGame.setPlayerSpriteId(playerSpriteId);
        
        window.RPGMemoryGame.init();
        
        // 延迟一下再更新数据，确保场景已经完全初始化
        setTimeout(() => {
          // 如果有缓存的数据，立即更新
          const currentContent = $("#smart_memory_injection_content").val();
          if (currentContent) {
            try {
              const jsonMatch = currentContent.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                const rpgData = JSON.parse(jsonMatch[0]);
                window.RPGMemoryGame.updateRPG(rpgData);
                console.log("RPG记忆增强器: 已加载缓存数据");
              }
            } catch (e) {
              console.log("RPG记忆增强器: 缓存数据解析失败");
            }
          }
        }, 500);  // 等待500ms确保场景初始化完成
      }
    }
  });
  
  // 绑定"进入"按钮点击事件
  $(document).on("click", "#rpg_enter_button", function(e) {
    e.preventDefault();
    e.stopPropagation();
    console.log("点击了进入按钮");
    openRPGWindow();
  });
  
  // 主角外观选择
  $("#rpg_player_sprite").on("change", function() {
    const spriteId = parseInt($(this).val());
    extension_settings[extensionName].playerSpriteId = spriteId;
    saveSettingsDebounced();
    console.log(`RPG记忆增强器: 主角外观ID已设置为 ${spriteId}`);
  });
  
  // 应用主角外观
  $("#apply_player_sprite").on("click", function() {
    const spriteId = parseInt($("#rpg_player_sprite").val());
    if (window.RPGMemoryGame && window.RPGMemoryGame.updatePlayerSprite) {
      window.RPGMemoryGame.updatePlayerSprite(spriteId);
      toastr.success(`主角外观已更新为ID: ${spriteId}`, "RPG记忆增强器");
    } else {
      toastr.warning("请先打开游戏窗口", "RPG记忆增强器");
    }
  });
  
  // 关闭窗口按钮
  $(document).on("click", "#close_rpg_window", function(e) {
    e.preventDefault();
    e.stopPropagation();
    
    $("#rpg-floating-window").hide();
    $("#rpg-overlay").remove();  // 移除遮罩层
    $('body').css('overflow', '');  // 恢复滚动
    
    if (window.RPGMemoryGame) {
      window.RPGMemoryGame.destroy();
    }
  });
  
  // 防止RPG窗口内部点击事件穿透
  $(document).on("click touchstart touchmove touchend", "#rpg-floating-window", function(e) {
    e.stopPropagation();
  });
  
  // 防止游戏画布事件穿透
  $(document).on("click touchstart touchmove touchend", "#rpg-canvas", function(e) {
    e.stopPropagation();
  });
  
  // 防止面板事件穿透
  $(document).on("click touchstart", ".rpg-inventory-panel, .rpg-player-panel, .rpg-event-panel", function(e) {
    e.stopPropagation();
  });
  
  // 添加脉冲动画效果（只在启用时显示）
  if (extension_settings[extensionName]?.rpgFloatingEnabled !== false) {
    setTimeout(() => {
      $("#rpg-floating-button").addClass("pulse");
      setTimeout(() => {
        $("#rpg-floating-button").removeClass("pulse");
      }, 6000);  // 6秒后停止动画
    }, 2000);  // 页面加载2秒后开始
  }
  
  // 悬浮按钮开关事件
  $("#rpg_floating_enabled").on("change", function() {
    const isEnabled = $(this).prop("checked");
    extension_settings[extensionName].rpgFloatingEnabled = isEnabled;
    
    if (isEnabled) {
      $('#rpg-floating-button').fadeIn();
    } else {
      $('#rpg-floating-button').fadeOut();
      // 如果窗口打开了，也关闭它
      $("#rpg-floating-window").hide();
      if (window.RPGMemoryGame) {
        window.RPGMemoryGame.destroy();
      }
    }
    
    saveSettingsDebounced();
    console.log(`RPG悬浮按钮已${isEnabled ? '启用' : '禁用'}`);
  });
  
  // 测试JSON解析按钮
  $("#test_rpg_json").on("click", function() {
    const testData = {
      npcs: [
        {
          id: "npc_1",
          name: "测试商人",
          spriteId: 35,
          x: 100,  // 地图范围内
          y: 100,
          dialogue: "欢迎来到冰淇淋店！",
          emotion: "happy",
          relationship: "友好"
        },
        {
          id: "npc_2",
          name: "冒险者",
          spriteId: 5,
          x: 150,  // 地图范围内
          y: 120,
          dialogue: "我在寻找传说中的冰淇淋！",
          emotion: "neutral",
          relationship: "陌生人"
        }
      ],
      inventory: [
        { name: "冰淇淋", quantity: 3 },
        { name: "金币", quantity: 100 }
      ],
      events: {
        current: "正在探索冰淇淋店",
        permanent: "第一次来到冰淇淋店，遇到了友好的商人"
      }
    };
    
    // 将测试数据写入注入框
    const jsonStr = JSON.stringify(testData, null, 2);
    $("#smart_memory_injection_content").val("测试数据：\n" + jsonStr);
    
    // 如果游戏已打开，立即更新
    if (window.RPGMemoryGame && window.RPGMemoryGame.scene) {
      window.RPGMemoryGame.updateRPG(testData);
      toastr.success("已更新游戏数据", "RPG记忆增强器");
    } else {
      // 自动打开游戏窗口
      $("#rpg-floating-window").show();
      if (window.RPGMemoryGame) {
        // 先设置玩家精灵ID
        const playerSpriteId = extension_settings[extensionName]?.playerSpriteId || 0;
        window.RPGMemoryGame.setPlayerSpriteId(playerSpriteId);
        
        window.RPGMemoryGame.init();
        setTimeout(() => {
          window.RPGMemoryGame.updateRPG(testData);
          toastr.success("已打开游戏并加载测试数据", "RPG记忆增强器");
        }, 500);
      }
    }
  });
  
  // 监听游戏消息
  window.addEventListener("message", function(event) {
    if (event.data && event.data.type === "game-ready") {
      console.log("RPG游戏已准备就绪");
      
      // 如果有缓存的RPG数据，立即发送
      const currentContent = $("#smart_memory_injection_content").val();
      if (currentContent) {
        try {
          const jsonMatch = currentContent.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const rpgData = JSON.parse(jsonMatch[0]);
            const gameFrame = document.getElementById('rpg-game-frame');
            if (gameFrame && gameFrame.contentWindow) {
              gameFrame.contentWindow.postMessage({
                type: 'update-rpg',
                rpgData: rpgData
              }, '*');
            }
          }
        } catch (e) {
          console.log("初始RPG数据解析失败");
        }
      }
    }
  });
  
  // 模型选择更改时保存
  $("#smart_memory_model").on("change", function() {
    const model = $(this).val();
    if (model) {
      extension_settings[extensionName].aiModel = model;
      console.log(`智能总结: 已选择模型: ${model}`);
      saveSettingsDebounced();
    }
  });
  
  $("#smart_memory_enabled").on("change", function() {
    const isChecked = $(this).prop("checked");
    extension_settings[extensionName].enabled = isChecked;
    console.log(`[智能总结] 功能已${isChecked ? '启用' : '禁用'}`);
    saveSettingsDebounced();
  });
  
  $("#smart_memory_auto_update").on("change", function() {
    const isChecked = $(this).prop("checked");
    extension_settings[extensionName].autoUpdate = isChecked;
    console.log(`[智能总结] 自动更新设置已更改为: ${isChecked ? '启用' : '禁用'}`);
    saveSettingsDebounced();
  });
  
  $("#smart_memory_depth").on("input", function() {
    $("#smart_memory_depth_value").text($(this).val());
  });
  
  // 更新间隔滑块
  $("#smart_memory_update_interval").on("input", function() {
    const value = $(this).val();
    $("#smart_memory_update_interval_value").text(value);
    extension_settings[extensionName].updateInterval = parseInt(value);
    console.log(`智能总结: 更新间隔已设置为: 每 ${value} 轮对话`);
    saveSettingsDebounced();
  });
  
  // 注入内容编辑 - 使用change事件确保保存
  $("#smart_memory_injection_content").on("input change", function() {
    const content = $(this).val();
    const context = getContext();
    const characterName = context?.name2 || "unknown";
    
    // 保存到当前角色
    if (!extension_settings[extensionName].characterInjections) {
      extension_settings[extensionName].characterInjections = {};
    }
    extension_settings[extensionName].characterInjections[characterName] = content;
    extension_settings[extensionName].injectionContent = content;
    
    console.log(`智能总结: 注入内容已手动编辑，长度: ${content.length}`);
    console.log(`智能总结: 内容预览: ${content.substring(0, 50)}...`);
    saveSettingsDebounced();
  });
  
  // 加载设置
  await loadSettings();
  
  // 加载主角外观设置
  if (extension_settings[extensionName].playerSpriteId !== undefined) {
    $("#rpg_player_sprite").val(extension_settings[extensionName].playerSpriteId);
  }
  
  // 加载悬浮按钮设置
  if (extension_settings[extensionName].rpgFloatingEnabled !== undefined) {
    $("#rpg_floating_enabled").prop("checked", extension_settings[extensionName].rpgFloatingEnabled);
    if (!extension_settings[extensionName].rpgFloatingEnabled) {
      $('#rpg-floating-button').hide();
    }
  }
  
  // 设置消息监听
  setupMessageListener();
  
  // 监听生成开始事件，在此时注入内容
  eventSource.on(event_types.GENERATION_STARTED, async () => {
    // 如果功能未启用，直接返回
    if (!extension_settings[extensionName]?.enabled) {
      return;
    }
    console.log("智能总结: 🚀 检测到AI生成开始，正在注入总结内容...");
    injectBeforeGenerate();
  });
  
  // 初始化时加载当前角色的注入内容
  const context = getContext();
  const characterName = context?.name2 || "unknown";
  if (extension_settings[extensionName]?.characterInjections?.[characterName]) {
    const savedContent = extension_settings[extensionName].characterInjections[characterName];
    extension_settings[extensionName].injectionContent = savedContent;
    $("#smart_memory_injection_content").val(savedContent);
    console.log(`智能总结: 初始加载角色 "${characterName}" 的注入内容，长度: ${savedContent.length}`);
  }
  
  console.log("智能总结: 扩展已成功加载");
  console.log("智能总结: 当前版本: 1.0.0");
  console.log("智能总结: 初始设置:", extension_settings[extensionName]);
});


// 已经在上面export了getInjectionContent，不需要重复导出