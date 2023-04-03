import subprocess
import re
from collections import defaultdict

num_runs = 4
winners = defaultdict(int)
winner_per_game = []
delayed_moves_per_game = []
game_links = []

for i in range(num_runs):
    print(f"Run {i+1}/{num_runs}...")
    # Run the program and capture the output
    output = subprocess.check_output(
        [
            "npm",
            "start",
            "--",
            "-s",
            "snakepit/mini",
            # "-h",
            # "http://localhost:8080",
            "-sp",
        ],
        universal_newlines=True,
    )
    # Remove escape codes from the output
    output = re.sub("\x1B\[([0-9]{1,2}(;[0-9]{1,2})?)?[mGK]", "", output)

    # Use regex to find number of delayed moves
    count = len(re.findall(r"Sent move within wrong world tick", output))
    delayed_moves_per_game.append(count)

    # Use regex to find the game link
    # link = re.search(r"Game result is in: (.*)", output)
    link = re.search(r"Game result is in:\s(.+)", output)
    if link:
        game_links.append(link.group(1))

    # Use regex to find the winner
    winner = re.search(r"The winner was (\w+)", output)
    if winner:
        winner_name = winner.group(1)
        winner_per_game.append(winner_name)
        print(f"Winner: {winner_name}")
        winners[winner_name] += 1

print()
print("Results:")

for winner, count in winners.items():
    print(f"{winner}: {count} wins ({count/num_runs*100:.2f}% win rate)")

    # How many games had a delay?
    count_non_zero = len([x for x in delayed_moves_per_game if x > 0])

    # Any game with a lot of delays?
    if max(delayed_moves_per_game) > 10:
        print("WARNING: Some games had a lot of delayed moves!")
        print([i for i, x in enumerate(delayed_moves_per_game) if x > 10])

# Append game links to file
with open("stats_game_links.txt", "w") as f:
    for i, item in enumerate(game_links):
        winner = winner_per_game[i]
        delayed_moves = delayed_moves_per_game[i]
        f.write(f"Winner: {winner}, delayed_moves: {delayed_moves}, link: {item}\n")

print("Game links can be found in stats_game_links.txt")
