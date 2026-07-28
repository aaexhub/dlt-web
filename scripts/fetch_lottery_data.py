#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
彩票往期数据抓取脚本
数据源：中国体育彩票官方API (sporttery.cn) + 500.com
支持：排列3、排列5、七星彩
用法：python3 fetch_lottery_data.py [--count 100]
输出：更新 ../index.html 中的 window.PL3_DRAWS / PL5_DRAWS / QXW_DRAWS 静态数据
"""

import requests
import re
import json
import sys
import os
from datetime import datetime

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    "Referer": "https://www.lottery.gov.cn/",
}

# ========== 排列3 ==========
def fetch_pl3(count=100):
    """从体彩官方API获取排列3历史数据"""
    page_size = min(count, 100)
    page = 1
    all_draws = []
    
    while len(all_draws) < count:
        url = f"https://webapi.sporttery.cn/gateway/lottery/getHistoryPageListV1.qry?gameNo=35&provinceId=0&pageSize={page_size}&isVer=1&pageNo={page}"
        try:
            r = requests.get(url, headers=HEADERS, timeout=15)
            data = r.json()
            draws = data.get("value", {}).get("list", [])
            total = data.get("value", {}).get("total", 0)
            
            for d in draws:
                result = d.get("lotteryDrawResult", "")
                nums = [int(x) for x in result.split()]
                if len(nums) == 3:
                    all_draws.append({
                        "id": d.get("lotteryDrawNum", ""),
                        "nums": nums,
                        "date": d.get("lotteryDrawTime", "")
                    })
            
            if len(draws) < page_size or len(all_draws) >= count:
                break
            page += 1
        except Exception as e:
            print(f"  [ERROR] PL3 fetch page {page}: {e}")
            break
    
    all_draws = all_draws[:count]
    print(f"  ✅ 排列3: 获取 {len(all_draws)} 期 (最新: {all_draws[0]['id']}, {all_draws[0]['date']})")
    return all_draws


# ========== 排列5 ==========
def fetch_pl5(count=100):
    """从体彩官方API获取排列5历史数据"""
    page_size = min(count, 100)
    page = 1
    all_draws = []
    
    while len(all_draws) < count:
        url = f"https://webapi.sporttery.cn/gateway/lottery/getHistoryPageListV1.qry?gameNo=350133&provinceId=0&pageSize={page_size}&isVer=1&pageNo={page}"
        try:
            r = requests.get(url, headers=HEADERS, timeout=15)
            data = r.json()
            draws = data.get("value", {}).get("list", [])
            
            for d in draws:
                result = d.get("lotteryDrawResult", "")
                nums = [int(x) for x in result.split()]
                if len(nums) == 5:
                    all_draws.append({
                        "id": d.get("lotteryDrawNum", ""),
                        "nums": nums,
                        "date": d.get("lotteryDrawTime", "")
                    })
            
            if len(draws) < page_size or len(all_draws) >= count:
                break
            page += 1
        except Exception as e:
            print(f"  [ERROR] PL5 fetch page {page}: {e}")
            break
    
    all_draws = all_draws[:count]
    print(f"  ✅ 排列5: 获取 {len(all_draws)} 期 (最新: {all_draws[0]['id']}, {all_draws[0]['date']})")
    return all_draws


# ========== 七星彩 ==========
def fetch_qxc_500(count=100):
    """从500.com抓取七星彩历史数据（逐期抓取详情页）"""
    print("  🔄 从500.com逐期抓取七星彩数据...")
    all_draws = []
    
    # 先获取最新期号
    try:
        r = requests.get("https://kaijiang.500.com/qxc.shtml", headers=HEADERS, timeout=15)
        # 从页面提取最新期号
        match = re.search(r'/shtml/qxc/(\d+)\.shtml', r.text)
        if match:
            latest_issue = int(match.group(1))
            print(f"  最新期号: {latest_issue}")
        else:
            print("  ❌ 无法获取最新期号")
            return fetch_qxc_fallback(count)
    except Exception as e:
        print(f"  ❌ 获取首页失败: {e}")
        return fetch_qxc_fallback(count)
    
    # 逐期抓取
    success = 0
    fail = 0
    for offset in range(min(count, 200)):
        issue = latest_issue - offset
        url = f"https://kaijiang.500.com/shtml/qxc/{issue}.shtml"
        try:
            r = requests.get(url, headers={**HEADERS, "Referer": "https://kaijiang.500.com/qxc.shtml"}, timeout=10)
            if r.status_code != 200:
                fail += 1
                continue
            
            # 提取开奖号码
            balls = re.findall(r'class="[^"]*ball_red[^"]*"[^>]*>(\d+)<', r.text)
            if not balls:
                # 尝试其他模式
                balls = re.findall(r'class="[^"]*ball[^"]*"[^>]*>(\d+)<', r.text)
            
            # 提取日期
            date_match = re.search(r'开奖日期[：:<]\s*(\d{4}-\d{2}-\d{2})', r.text)
            if not date_match:
                date_match = re.search(r'(\d{4}-\d{2}-\d{2})\s*开奖', r.text)
            
            if balls and len(balls) >= 7:
                nums = [int(b) for b in balls[:7]]
                date_str = date_match.group(1) if date_match else "?"
                all_draws.append({
                    "id": str(issue),
                    "nums": nums,
                    "date": date_str
                })
                success += 1
            else:
                fail += 1
                
        except Exception as e:
            fail += 1
            if fail > 10 and success == 0:
                print(f"  ❌ 连续失败过多，回退到备用方案")
                break
    
    print(f"  成功: {success} 期, 失败: {fail} 期")
    
    if success == 0:
        print("  ⚠️ 500.com抓取失败，使用备用方案")
        return fetch_qxc_fallback(count)
    
    return all_draws[:count]


def fetch_qxc_fallback(count=100):
    """七星彩备用方案：从500.com移动端或中彩网获取"""
    print("  🔄 尝试备用数据源...")
    all_draws = []
    
    # 备用1: 500.com 移动端
    try:
        mobile_headers = {**HEADERS, "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15"}
        r = requests.get("https://m.500.com/info/kaijiang/qxc/", headers=mobile_headers, timeout=15)
        if r.status_code == 200:
            # 找开奖列表数据
            # 模式: 期号 + 号码 + 日期
            pattern = r'(\d{5,7})[^<]*<[^>]*>[^<]*<[^>]*>[\s]*([\d\s]+?)[\s]*<[^>]*>[^<]*<[^>]*>[\s]*(\d{4}-\d{2}-\d{2})'
            matches = re.findall(pattern, r.text)
            for m in matches:
                nums = [int(x) for x in m[1].split()]
                if len(nums) == 7:
                    all_draws.append({"id": m[0], "nums": nums, "date": m[2]})
            
            if len(all_draws) >= 10:
                print(f"  ✅ 移动端获取: {len(all_draws)} 期")
                return all_draws[:count]
    except Exception as e:
        print(f"  移动端失败: {e}")
    
    # 备用2: 使用本地已有数据
    print("  ⚠️ 所有在线数据源均失败")
    print("  提示: 七星彩数据可通过手动运行 update_lottery_data.py 更新")
    return []


# ========== 生成JS代码 ==========
def generate_js_array(var_name, draws):
    """生成 JS window.XXX = [...] 代码"""
    items = []
    for d in draws:
        items.append(json.dumps(d, ensure_ascii=False))
    return f"window.{var_name} = [{', '.join(items)}];"


def update_index_html(pl3_draws, pl5_draws, qxc_draws, dry_run=False):
    """更新 index.html 中的静态数据"""
    script_dir = os.path.dirname(os.path.abspath(__file__))
    index_path = os.path.join(script_dir, '..', 'index.html')
    
    if not os.path.exists(index_path):
        print(f"❌ 文件不存在: {index_path}")
        return False
    
    with open(index_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # 更新 PL3_DRAWS
    if pl3_draws:
        new_pl3 = generate_js_array("PL3_DRAWS", pl3_draws)
        content = re.sub(
            r'window\.PL3_DRAWS\s*=\s*\[.*?\];',
            new_pl3 + ';',
            content,
            flags=re.DOTALL
        )
        print(f"  ✅ PL3_DRAWS 已更新 ({len(pl3_draws)} 期)")
    
    # 更新 PL5_DRAWS
    if pl5_draws:
        new_pl5 = generate_js_array("PL5_DRAWS", pl5_draws)
        content = re.sub(
            r'window\.PL5_DRAWS\s*=\s*\[.*?\];',
            new_pl5 + ';',
            content,
            flags=re.DOTALL
        )
        print(f"  ✅ PL5_DRAWS 已更新 ({len(pl5_draws)} 期)")
    
    # 更新 QXW_DRAWS
    if qxc_draws:
        new_qxc = generate_js_array("QXW_DRAWS", qxc_draws)
        content = re.sub(
            r'window\.QXW_DRAWS\s*=\s*\[.*?\];',
            new_qxc + ';',
            content,
            flags=re.DOTALL
        )
        print(f"  ✅ QXW_DRAWS 已更新 ({len(qxc_draws)} 期)")
    else:
        print(f"  ⚠️ QXW_DRAWS 未更新（未找到七星彩数据）")
    
    if dry_run:
        print("\n  [DRY RUN] 不写入文件")
    else:
        # 备份
        bak_path = index_path + '.bak'
        with open(bak_path, 'w', encoding='utf-8') as f:
            f.write(open(index_path, 'r', encoding='utf-8').read())
        
        with open(index_path, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"\n  📁 已保存: {index_path}")
        print(f"  📁 备份: {bak_path}")
    
    return True


# ========== 主函数 ==========
def main():
    count = 100
    if '--count' in sys.argv:
        idx = sys.argv.index('--count')
        if idx + 1 < len(sys.argv):
            count = int(sys.argv[idx + 1])
    
    dry_run = '--dry-run' in sys.argv
    
    print(f"🎯 彩票数据抓取 (count={count})")
    print(f"   时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print()
    
    # 抓取
    print("📡 抓取排列3...")
    pl3 = fetch_pl3(count)
    print()
    
    print("📡 抓取排列5...")
    pl5 = fetch_pl5(count)
    print()
    
    print("📡 抓取七星彩...")
    qxc = fetch_qxc_500(count)
    print()
    
    # 更新文件
    if pl3 or pl5 or qxc:
        print("📝 更新 index.html...")
        update_index_html(pl3, pl5, qxc, dry_run)
        
        # 汇总
        print(f"\n{'='*40}")
        print(f"📊 抓取汇总:")
        print(f"  排列3: {len(pl3)} 期")
        print(f"  排列5: {len(pl5)} 期")
        print(f"  七星彩: {len(qxc)} 期")
    else:
        print("❌ 所有彩种抓取失败")

if __name__ == '__main__':
    main()
