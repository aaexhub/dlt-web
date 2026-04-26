/**
 * 大乐透选号系统 - 前端内嵌算法引擎
 * 天启算法完整JS移植版，纯前端无后端依赖
 * 用于GitHub Pages部署
 */

// ========== 引擎配置 ==========
(function() {

// ================================
// 1. 彩经分析引擎
// ================================
const 彩经引擎 = {
    /** 前区频率统计 */
    前区频率(draws) {
        const freq = new Array(35).fill(0);
        draws.forEach(d => d.front.forEach(n => freq[n-1]++));
        return freq;
    },

    /** 后区频率统计 */
    后区频率(draws) {
        const freq = new Array(12).fill(0);
        draws.forEach(d => d.back.forEach(n => freq[n-1]++));
        return freq;
    },

    /** 遗漏值计算 */
    遗漏值(draws, maxNum, getNums) {
        const miss = new Array(maxNum).fill(draws.length);
        for (let i = 0; i < draws.length; i++) {
            getNums(draws[i]).forEach(n => {
                if (miss[n-1] === draws.length) miss[n-1] = i;
            });
        }
        return miss.map((v, i) => v === draws.length ? 0 : draws.length - 1 - v);
    },

    /** 冷热判断 */
    冷热判断(freq) {
        const sorted = [...freq].sort((a,b) => a-b);
        const tHot = sorted[Math.floor(sorted.length * 0.7)] || 4;
        const tCold = sorted[Math.floor(sorted.length * 0.3)] || 2;
        return freq.map((v, i) => ({
            num: i+1, freq: v,
            status: v >= tHot ? '热' : v <= tCold ? '冷' : '温'
        }));
    },

    /** 奇偶分布 */
    奇偶分析(draws) {
        const count = {};
        draws.forEach(d => {
            const odds = d.front.filter(n => n % 2 === 1).length;
            const key = odds + ':' + (5-odds);
            count[key] = (count[key] || 0) + 1;
        });
        return Object.entries(count).sort((a,b) => b[1] - a[1]);
    },

    /** 和值分析 */
    和值分析(draws) {
        const vals = draws.map(d => d.front.reduce((s,n) => s + n, 0));
        const avg = Math.round(vals.reduce((s,v) => s+v, 0) / vals.length);
        return { 平均和值: avg, 建议范围: (avg-20) + '-' + (avg+20) };
    }
};

// ================================
// 2. 号码推荐引擎
// ================================
const 推荐引擎 = {
    /** 获取最新开奖号码的五行分析 */
    分析五行(draws) {
        if (!draws || draws.length === 0) return null;
        const latest = draws[draws.length - 1];
        const allNums = [...latest.front, ...latest.back];
        const wxCount = { "木": 0, "火": 0, "土": 0, "金": 0, "水": 0 };
        allNums.forEach(n => {
            const wx = IChingAnalyzer.getWuxing(n);
            if (wx) wxCount[wx]++;
        });
        const sorted = Object.entries(wxCount).sort((a,b) => a[1] - b[1]);
        const 最缺五行 = sorted.slice(0, 2).map(x => x[0]);

        // 阴阳分析
        let yang = 0, yin = 0;
        allNums.forEach(n => {
            const yy = IChingAnalyzer.getYinYang(n);
            if (yy === '阳') yang++;
            else if (yy === '阴') yin++;
        });
        const yangRatio = yang / (yang + yin || 1);
        const 缺失阴阳 = yangRatio > 0.6 ? '阴' : (yangRatio < 0.4 ? '阳' : null);

        return { 最缺五行, 缺失阴阳, 五行分布: wxCount, 阳比例: yangRatio };
    },

    /** 号码评分 */
    评分(策略, draws) {
        const n = draws.length;
        const frontFreq = 彩经引擎.前区频率(draws);
        const backFreq = 彩经引擎.后区频率(draws);
        const frontMiss = 彩经引擎.遗漏值(draws, 35, d => d.front);
        const backMiss = 彩经引擎.遗漏值(draws, 12, d => d.back);
        const frontHC = 彩经引擎.冷热判断(frontFreq);
        const backHC = 彩经引擎.冷热判断(backFreq);

        // 五行分析
        const 五行 = this.分析五行(draws);

        // 权重
        const w = {
            balanced: { 易经: 0.5, 彩经: 0.5 },
            yijing: { 易经: 0.7, 彩经: 0.3 },
            caijing: { 易经: 0.3, 彩经: 0.7 },
            hot: { 易经: 0.3, 彩经: 0.7 },
            cold: { 易经: 0.3, 彩经: 0.7 }
        }[策略] || { 易经: 0.5, 彩经: 0.5 };

        const maxFrontFreq = Math.max(...frontFreq, 1);
        const maxBackFreq = Math.max(...backFreq, 1);

        // 前区评分
        const frontScores = {};
        for (let n = 1; n <= 35; n++) {
            let 彩经分 = frontFreq[n-1] / maxFrontFreq;
            if (策略 === 'hot' && frontHC[n-1].status === '热') 彩经分 += 0.5;
            if (策略 === 'cold' && frontHC[n-1].status === '冷') 彩经分 += 0.5;
            if (策略 === 'cold' && frontMiss[n-1] > 8) 彩经分 += 0.5;
            else if (策略 === 'cold' && frontMiss[n-1] > 5) 彩经分 += 0.3;

            // 易经分
            let 易经分 = 0.2;
            const wx = IChingAnalyzer.getWuxing(n);
            if (wx && 五行 && 五行.最缺五行.includes(wx)) 易经分 += 0.3;
            const yy = IChingAnalyzer.getYinYang(n);
            if (yy && 五行 && 五行.缺失阴阳 && yy === 五行.缺失阴阳) 易经分 += 0.2;
            易经分 += Math.random() * 0.05;

            frontScores[n] = w.易经 * 易经分 + w.彩经 * 彩经分;
        }

        // 后区评分
        const backScores = {};
        for (let n = 1; n <= 12; n++) {
            let 彩经分 = backFreq[n-1] / maxBackFreq;
            if (策略 === 'hot' && backHC[n-1].status === '热') 彩经分 += 0.5;
            if (策略 === 'cold' && backHC[n-1].status === '冷') 彩经分 += 0.4;
            if (策略 === 'cold' && backMiss[n-1] > 6) 彩经分 += 0.4;

            let 易经分 = 0.2 + Math.random() * 0.05;
            backScores[n] = w.易经 * 易经分 + w.彩经 * 彩经分;
        }

        // 归一化
        const norm = (scores) => {
            const max = Math.max(...Object.values(scores));
            if (max > 0) for (const k in scores) scores[k] /= max;
            return scores;
        };
        norm(frontScores);
        norm(backScores);

        return {
            前区评分: frontScores,
            后区评分: backScores,
            冷热: { 前区: frontHC, 后区: backHC },
            遗漏: { 前区: frontMiss, 后区: backMiss },
            五行: 五行,
            彩经摘要: {
                前区热号: frontHC.filter(x => x.status === '热').map(x => x.num),
                前区冷号: frontHC.filter(x => x.status === '冷').map(x => x.num),
                奇偶最常: 彩经引擎.奇偶分析(draws).slice(0, 3),
                和值: 彩经引擎.和值分析(draws)
            }
        };
    },

    /** 智能选号 */
    选号(评分, count) {
        const candidates = Object.entries(评分).map(([n, s]) => ({ num: parseInt(n), score: s }));
        candidates.sort((a, b) => b.score - a.score);

        const selected = [];
        const used = new Set();
        for (const c of candidates) {
            if (selected.length >= count) break;
            if (used.has(c.num)) continue;
            selected.push(c.num);
            used.add(c.num);
        }

        // 如果不够补充
        if (selected.length < count) {
            for (const c of candidates) {
                if (selected.length >= count) break;
                if (!used.has(c.num)) { selected.push(c.num); used.add(c.num); }
            }
        }

        // 奇偶平衡（仅前区）
        if (count === 5 && selected.length === 5) {
            const odds = selected.filter(n => n % 2 === 1).length;
            if (odds === 0 || odds === 5) {
                // 过于极端，换一个
                const swapIdx = odds === 0 ? 3 : 1;
                const old = selected[swapIdx];
                const alt = Array.from({length: 35}, (_, i) => i+1)
                    .filter(n => !selected.includes(n) && n % 2 !== old % 2);
                if (alt.length > 0) {
                    alt.sort((a, b) => (评分[b] || 0) - (评分[a] || 0));
                    selected[swapIdx] = alt[0];
                }
            }
        }

        return selected.sort((a, b) => a - b);
    },

    /** 主推荐 */
    主推荐(策略, draws) {
        const 结果 = this.评分(策略, draws);
        const 前区 = this.选号(结果.前区评分, 5);
        const 后区 = this.选号(结果.后区评分, 2);

        // 主推荐的易经分析
        const 分析 = IChingAnalyzer.comprehensiveAnalysis(前区, 后区);

        // 评分排行
        const 前区排行 = Object.entries(结果.前区评分)
            .map(([n, s]) => ({ 号码: parseInt(n), 分数: Math.round(s * 10000) / 10000 }))
            .sort((a, b) => b.分数 - a.分数).slice(0, 15);
        const 后区排行 = Object.entries(结果.后区评分)
            .map(([n, s]) => ({ 号码: parseInt(n), 分数: Math.round(s * 10000) / 10000 }))
            .sort((a, b) => b.分数 - a.分数).slice(0, 6);

        // 彩经摘要文本
        const 热号 = 结果.彩经摘要.前区热号.slice(0, 5).join(',');
        const 冷号 = 结果.彩经摘要.前区冷号.slice(0, 5).join(',');
        const 奇偶 = 结果.彩经摘要.奇偶最常[0] || ['3:2', 0];
        const 和值 = 结果.彩经摘要.和值;
        const 摘要 = `前区热号: ${热号} | 冷号: ${冷号} | 最常见奇偶比: ${奇偶[0]}(${奇偶[1]}次) | 建议和值: ${和值.建议范围}`;

        return {
            策略: 策略,
            主推荐: { 前区, 后区, 易经分析: 分析 },
            备选推荐: Array.from({length: 4}, () => {
                const 备 = this.评分(策略, draws);
                // 加点随机扰动
                Object.keys(备.前区评分).forEach(k => 备.前区评分[k] += Math.random() * 0.3);
                Object.keys(备.后区评分).forEach(k => 备.后区评分[k] += Math.random() * 0.3);
                return { 前区: this.选号(备.前区评分, 5), 后区: this.选号(备.后区评分, 2) };
            }),
            前区评分排行: 前区排行,
            后区评分排行: 后区排行,
            彩经分析摘要: 摘要,
            五行提示: 结果.五行 ? {
                最缺: 结果.五行.最缺五行.join(','),
                缺失阴阳: 结果.五行.缺失阴阳 || '平衡'
            } : null,
            推荐时间: new Date().toLocaleString('zh-CN'),
            免责声明: "本推荐仅供娱乐参考"
        };
    }
};

// ================================
// 3. 多注生成（增强版）
// ================================
function 天启选号(策略, 组数) {
    const draws = typeof DRAWS !== 'undefined' ? DRAWS : [];
    if (draws.length === 0) return [];

    const 策略映射 = { balanced: 'balanced', iching: 'yijing', hot: 'hot', cold: 'cold' };
    const api策略 = 策略映射[策略] || 'balanced';

    const results = [];
    for (let i = 0; i < 组数; i++) {
        const result = 推荐引擎.主推荐(api策略, draws);
        // 轮流用不同扰动来产生不同号码
        if (i > 0 && results.length > 0) {
            // 检查是否与前面的重复
            const fronts = results.map(r => r.front.join(','));
            if (fronts.includes(result.主推荐.前区.join(','))) {
                // 如果重复，再加一次随机扰动
                const 备 = 推荐引擎.评分(api策略, draws);
                Object.keys(备.前区评分).forEach(k => 备.前区评分[k] += Math.random() * 0.5);
                Object.keys(备.后区评分).forEach(k => 备.后区评分[k] += Math.random() * 0.5);
                result.主推荐.前区 = 推荐引擎.选号(备.前区评分, 5);
                result.主推荐.后区 = 推荐引擎.选号(备.后区评分, 2);
                result.主推荐.易经分析 = IChingAnalyzer.comprehensiveAnalysis(result.主推荐.前区, result.主推荐.后区);
            }
        }
        results.push({
            front: result.主推荐.前区,
            back: result.主推荐.后区,
            yijing: result.主推荐.易经分析,
            yijingText: result.主推荐.易经分析?.hexagram?.hexagram?.name + '卦',
            yijingId: result.主推荐.易经分析?.hexagram?.hexagram?.id
        });
    }
    return results;
}

// ================================
// 4. 挂载到window
// ================================
window.推荐引擎 = 推荐引擎;
window.天启选号 = 天启选号;
window.彩经引擎 = 彩经引擎;

console.log('☯ 易彩 · 算法引擎已加载');
console.log('  选用window.推荐引擎.主推荐("balanced", DRAWS) 获取推荐');
console.log('  选用window.天启选号("balanced", 5) 生成5注');

})();
